import crypto from "node:crypto";
import { Prisma, type CaptureRoutingFeedbackOutcome } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueAgentJob } from "@/lib/agent/queue";
import {
  isAgentWorkerEnabled,
  sorterJobInputSchema,
  sorterResultSchema,
  type SorterJobInput,
  type SorterResult,
} from "@/lib/agent/schemas";

export const SORTER_PROMPT_VERSION = "home-base-sorter-v1";

type DestinationArea = { id: string };
type DestinationProject = { id: string; areaId: string | null };

export function normalizeSorterJobInput(input: SorterJobInput): SorterJobInput {
  return sorterJobInputSchema.parse({
    ...input,
    text: boundedText(input.text, 10_000),
    timezone: boundedText(input.timezone, 100),
    areas: input.areas.slice(0, 200).map((area) => ({
      ...area,
      name: boundedText(area.name, 200),
      path: boundedText(area.path, 500),
    })),
    projects: input.projects.slice(0, 200).map((project) => ({
      ...project,
      name: boundedText(project.name, 200),
      path: boundedText(project.path, 500),
    })),
    examples: input.examples.slice(0, 8).map((example) => ({
      ...example,
      text: boundedText(example.text, 2_000),
    })),
  });
}

export function normalizeSorterProposal(
  input: SorterResult,
  areas: DestinationArea[],
  projects: DestinationProject[],
) {
  const parsed = sorterResultSchema.parse(input);
  if (parsed.disposition === "unresolved") return parsed;

  const project = projects.find((candidate) => candidate.id === parsed.projectId);
  const projectId = project?.id ?? null;
  const requestedArea = areas.some((area) => area.id === parsed.areaId)
    ? parsed.areaId
    : null;
  const areaId = project?.areaId ?? requestedArea;

  return { ...parsed, areaId, projectId };
}

export async function enqueueUnresolvedCaptureJobs(limit = 50) {
  if (!isAgentWorkerEnabled("sorter")) return 0;
  const captures = await prisma.capture.findMany({
    where: {
      status: "active",
      parseStatus: { in: ["ambiguous", "failed"] },
      agentJobs: { none: { kind: "capture_sort" } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(Math.trunc(limit), 1), 100),
  });

  for (const capture of captures) {
    await enqueueAgentJob({
      role: "sorter",
      kind: "capture_sort",
      idempotencyKey: `capture-sort:${capture.id}:${SORTER_PROMPT_VERSION}`,
      payload: { captureId: capture.id },
      captureId: capture.id,
      promptVersion: SORTER_PROMPT_VERSION,
    });
  }
  return captures.length;
}

export async function buildSorterJobInput(captureId: string): Promise<SorterJobInput> {
  const [capture, areas, projects, examples] = await Promise.all([
    prisma.capture.findFirst({
      where: {
        id: captureId,
        status: "active",
        parseStatus: { in: ["ambiguous", "failed"] },
      },
      select: {
        id: true,
        rawText: true,
        textEdits: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { text: true },
        },
      },
    }),
    prisma.area.findMany({
      where: { status: "active" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentAreaId: true },
      take: 200,
    }),
    prisma.project.findMany({
      where: { status: { in: ["active", "someday", "parked"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, areaId: true },
      take: 200,
    }),
    prisma.captureRoutingFeedback.findMany({
      where: { eligibleAsExample: true },
      orderBy: { createdAt: "desc" },
      select: { effectiveText: true, final: true },
      take: 16,
    }),
  ]);
  if (!capture) throw new Error("Capture is no longer available.");

  const areaById = new Map(areas.map((area) => [area.id, area]));
  const areaPath = (areaId: string) => {
    const names: string[] = [];
    const seen = new Set<string>();
    let current = areaById.get(areaId);
    while (current && !seen.has(current.id) && names.length < 12) {
      names.unshift(current.name);
      seen.add(current.id);
      current = current.parentAreaId ? areaById.get(current.parentAreaId) : undefined;
    }
    return names.join(" > ");
  };

  const reviewedExamples = examples.flatMap((example) => {
    const text = toRoutingExampleText(example.effectiveText);
    const parsed = reviewedFinal(example.final);
    return text && parsed ? [{ text, ...parsed }] : [];
  });

  return normalizeSorterJobInput({
    captureId: capture.id,
    text: capture.textEdits[0]?.text ?? capture.rawText,
    now: new Date().toISOString(),
    timezone: "America/New_York",
    areas: areas.map((area) => ({
      id: area.id,
      name: area.name,
      path: areaPath(area.id),
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      areaId: project.areaId,
      path: project.areaId
        ? `${areaPath(project.areaId)} > ${project.name}`
        : `Unfiled > ${project.name}`,
    })),
    examples: reviewedExamples.slice(0, 8),
  });
}

export async function applySorterProposal(
  input: {
    jobId: string;
    captureId: string;
    result: SorterResult;
    model: string;
    promptVersion?: string;
  },
  client: Prisma.TransactionClient,
) {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.captureId}, 0))`;
  const [capture, areas, projects, existingByJob, existingPending] = await Promise.all([
    client.capture.findFirst({
      where: {
        id: input.captureId,
        status: "active",
        parseStatus: { in: ["ambiguous", "failed"] },
      },
      select: { id: true },
    }),
    client.area.findMany({ where: { status: "active" }, select: { id: true } }),
    client.project.findMany({
      where: { status: { in: ["active", "someday", "parked"] } },
      select: { id: true, areaId: true },
    }),
    client.captureReviewProposal.findUnique({ where: { agentJobId: input.jobId } }),
    client.captureReviewProposal.findFirst({
      where: {
        captureId: input.captureId,
        status: { in: ["pending", "snoozed"] },
      },
    }),
  ]);
  if (existingByJob) return existingByJob;
  if (!capture || existingPending) return existingPending;

  const result = normalizeSorterProposal(input.result, areas, projects);
  if (result.disposition === "unresolved" || !result.targetType) return null;

  const proposal = await client.captureReviewProposal.create({
    data: {
      captureId: capture.id,
      suggestedType: result.targetType,
      suggestedAreaId: result.areaId,
      suggestedProjectId: result.projectId,
      reason: result.reason,
      confidence: result.confidence,
      model: input.model,
      promptVersion: input.promptVersion ?? SORTER_PROMPT_VERSION,
      agentJobId: input.jobId,
    },
  });
  await client.notification.create({
    data: {
      type: "capture_sort_proposed",
      title: "Capture ready to review",
      body: result.reason,
      sourceRef: {
        type: "capture_review_proposal",
        id: proposal.id,
        captureId: capture.id,
        source: "codex_sorter",
        agentJobId: input.jobId,
      },
    },
  });
  return proposal;
}

export async function recordCaptureRoutingFeedback(
  input: {
    captureId: string;
    proposalId?: string | null;
    outcome: CaptureRoutingFeedbackOutcome;
    effectiveText: string;
    proposed?: Prisma.InputJsonValue | null;
    final?: Prisma.InputJsonValue | null;
    model?: string | null;
    promptVersion?: string | null;
  },
  client: Prisma.TransactionClient,
) {
  return client.captureRoutingFeedback.create({
    data: {
      captureId: input.captureId,
      proposalId: input.proposalId ?? null,
      outcome: input.outcome,
      effectiveText: input.effectiveText,
      effectiveTextHash: crypto
        .createHash("sha256")
        .update(input.effectiveText)
        .digest("hex"),
      proposed: input.proposed ?? Prisma.JsonNull,
      final: input.final ?? Prisma.JsonNull,
      eligibleAsExample: input.outcome === "accepted" || input.outcome === "corrected",
      reviewer: "manual",
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
    },
  });
}

export function toRoutingExampleText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 2_000);
}

function boundedText(value: string, maximum: number) {
  return value.trim().slice(0, maximum);
}

function reviewedFinal(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = sorterResultSchema.safeParse({
    disposition: "proposal",
    targetType: value.targetType,
    areaId: value.areaId ?? null,
    projectId: value.projectId ?? null,
    confidence: 1,
    reason: "Reviewed Home Base filing decision.",
  });
  if (!parsed.success || !parsed.data.targetType) return null;
  return {
    targetType: parsed.data.targetType,
    areaId: parsed.data.areaId,
    projectId: parsed.data.projectId,
  };
}
