import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueueUnresolvedCaptureJobs } from "@/lib/agent/sorter";

const targetTypes = ["task", "idea", "note", "reference"] as const;

const routerResponseSchema = z.object({
  targetType: z.enum(targetTypes).nullable(),
  areaId: z.string().nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

type CaptureForProposal = {
  id: string;
  rawText: string;
  textEdits: Array<{ text: string }>;
};

export async function createCaptureReviewProposals({
  limit = 10,
}: {
  limit?: number;
} = {}) {
  if (process.env.HOME_BASE_CODEX_SORTER_ENABLED === "true") {
    const queued = await enqueueUnresolvedCaptureJobs(limit);
    return {
      ok: true as const,
      skipped: false,
      provider: "codex_worker" as const,
      queued,
      created: 0,
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_INBOX_ROUTER_MODEL;
  if (!apiKey || !model) {
    return {
      ok: true as const,
      skipped: true,
      reason: "ANTHROPIC_API_KEY or ANTHROPIC_INBOX_ROUTER_MODEL is not configured.",
      created: 0,
    };
  }

  const [captures, context] = await Promise.all([
    loadPendingCaptures(limit),
    loadRouterContext(),
  ]);

  if (captures.length === 0) {
    return { ok: true as const, skipped: false, created: 0 };
  }

  const anthropic = new Anthropic({ apiKey });
  let created = 0;
  for (const capture of captures) {
    const text = effectiveCaptureText(capture);
    const suggestion = await routeCapture(anthropic, model, text, context);
    if (!suggestion.targetType) continue;

    await prisma.captureReviewProposal.create({
      data: {
        captureId: capture.id,
        suggestedType: suggestion.targetType,
        suggestedAreaId: suggestion.areaId,
        reason: suggestion.reason ?? null,
        model,
      },
    });
    created += 1;
  }

  return { ok: true as const, skipped: false, created };
}

async function loadPendingCaptures(limit: number): Promise<CaptureForProposal[]> {
  return prisma.capture.findMany({
    where: {
      status: "active",
      parseStatus: { in: ["ambiguous", "failed"] },
      reviewProposals: {
        none: {
          status: { in: ["pending", "snoozed"] },
        },
      },
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
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

async function loadRouterContext() {
  const [areas, projects] = await Promise.all([
    prisma.area.findMany({
      where: { status: "active" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { status: { in: ["active", "someday", "parked"] } },
      select: {
        id: true,
        name: true,
        area: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  return {
    areas,
    projects,
    targetTypes,
  };
}

async function routeCapture(
  anthropic: Anthropic,
  model: string,
  text: string,
  context: Awaited<ReturnType<typeof loadRouterContext>>,
) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 500,
    system: `You route unresolved Home Base captures into durable filing proposals.
Return only JSON with keys targetType, areaId, reason.
targetType must be one of: task, idea, note, reference, or null.
Use task only for clear action intent. Use idea for possibilities and "idea:" thoughts.
Use note for facts, details, status, observations, and durable context.
Use reference for links, recommendations, books, movies, products, resources, or facts from outside sources.
Use null when the text is too vague or context-free.
Prefer an existing area by id. If no area clearly matches, use null.
Never create projects here. Never invent missing facts.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ text, context }),
      },
    ],
  });

  const raw = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  const parsed = routerResponseSchema.parse(JSON.parse(raw));
  return {
    targetType: parsed.targetType,
    areaId: validAreaId(parsed.areaId ?? null, context) ? parsed.areaId : null,
    reason: parsed.reason?.trim() || null,
  };
}

function validAreaId(
  areaId: string | null,
  context: Awaited<ReturnType<typeof loadRouterContext>>,
) {
  if (!areaId) return false;
  return context.areas.some((area) => area.id === areaId);
}

function effectiveCaptureText(capture: CaptureForProposal) {
  return capture.textEdits[0]?.text ?? capture.rawText;
}
