import Anthropic from "@anthropic-ai/sdk";
import type { CheckInSource, EntityParentType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { syncReferenceMentions } from "@/lib/reference-mentions";

export type CheckInActor = {
  source: "manual" | "capture" | "api";
  label?: string;
};

const DEFAULT_SUMMARIZE_MODEL = "claude-haiku-4-5-20251001";
const DAY_MS = 24 * 60 * 60 * 1000;

export async function createCheckInRecord(
  input: {
    parentType: EntityParentType;
    parentId: string;
    bodyMd: string;
    source?: CheckInSource;
    captureId?: string | null;
  },
  actor: CheckInActor,
) {
  const parentName = await getParentName(input.parentType, input.parentId);
  if (!parentName) {
    throw new Error(`No ${input.parentType} found for check-in.`);
  }

  const checkIn = await prisma.checkIn.create({
    data: {
      parentType: input.parentType,
      parentId: input.parentId,
      bodyMd: input.bodyMd,
      source: input.source ?? "manual",
      captureId: input.captureId ?? undefined,
    },
  });
  await syncReferenceMentions("check_in", checkIn.id, input.bodyMd);

  await prisma.notification.create({
    data: {
      type: "check_in_posted",
      title: "Check-in posted",
      body: `${parentName}: ${checkInSnippet(input.bodyMd)}`,
      sourceRef: {
        type: "check_in",
        id: checkIn.id,
        parentType: input.parentType,
        parentId: input.parentId,
        source: actor.source,
        actor: actor.label ?? null,
        checkInSource: checkIn.source,
      },
    },
  });

  return { checkIn, parentName };
}

export function checkInSnippet(bodyMd: string, max = 140) {
  const flattened = bodyMd.replace(/\s+/g, " ").trim();
  return flattened.length > max ? `${flattened.slice(0, max - 1)}…` : flattened;
}

/** Latest check-in per parent id (single query, newest wins). */
export async function getLatestCheckIns(
  parentType: EntityParentType,
  parentIds: string[],
) {
  if (parentIds.length === 0) {
    return new Map<string, { bodyMd: string; createdAt: Date }>();
  }

  const rows = await prisma.checkIn.findMany({
    where: { parentType, parentId: { in: parentIds } },
    orderBy: { createdAt: "desc" },
    distinct: ["parentId"],
    select: { parentId: true, bodyMd: true, createdAt: true },
  });

  return new Map(
    rows.map((row) => [
      row.parentId,
      { bodyMd: row.bodyMd, createdAt: row.createdAt },
    ]),
  );
}

export type SummarizeDraftResult =
  { ok: true; draft: string } | { ok: false; reason: string };

/**
 * Drafts a check-in from everything since the last check-in: completed
 * tasks, new notes/docs, milestones hit, and activity log entries.
 * Never posts — the caller opens the draft in the editor.
 */
export async function draftCheckInFromActivity(
  parentType: EntityParentType,
  parentId: string,
): Promise<SummarizeDraftResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model =
    process.env.ANTHROPIC_SUMMARIZE_MODEL ?? DEFAULT_SUMMARIZE_MODEL;

  if (!apiKey) {
    return {
      ok: false,
      reason:
        "AI summarize is not configured. Set ANTHROPIC_API_KEY in the deployment environment.",
    };
  }

  const parentName = await getParentName(parentType, parentId);
  if (!parentName) {
    return { ok: false, reason: "Record not found." };
  }

  const latest = await prisma.checkIn.findFirst({
    where: { parentType, parentId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const since = latest?.createdAt ?? new Date(Date.now() - 30 * DAY_MS);

  const [completedTasks, notes, docs, milestones, activity] = await Promise.all(
    [
      prisma.task.findMany({
        where: {
          status: "completed",
          completedAt: { gt: since },
          ...(parentType === "project"
            ? { projectId: parentId }
            : { areaId: parentId, projectId: null }),
        },
        select: { title: true, completedAt: true },
        orderBy: { completedAt: "desc" },
        take: 20,
      }),
      prisma.entityNote.findMany({
        where: { parentType, parentId, createdAt: { gt: since } },
        select: { bodyMd: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.entityDoc.findMany({
        where: { parentType, parentId, createdAt: { gt: since } },
        select: { title: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      parentType === "project"
        ? prisma.milestone.findMany({
            where: {
              projectId: parentId,
              status: "completed",
              completedAt: { gt: since },
            },
            select: { title: true },
            take: 10,
          })
        : Promise.resolve([]),
      parentType === "project"
        ? prisma.projectActivity.findMany({
            where: { projectId: parentId, createdAt: { gt: since } },
            select: { entry: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : Promise.resolve([]),
    ],
  );

  if (
    completedTasks.length === 0 &&
    notes.length === 0 &&
    docs.length === 0 &&
    milestones.length === 0 &&
    activity.length === 0
  ) {
    return {
      ok: false,
      reason: "No new activity since the last check-in to summarize.",
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model,
    max_tokens: 500,
    system: `You draft short status check-ins for Matt's personal operations system.
Write in first person, plain factual markdown, one short paragraph (bullets only if several distinct threads).
Mention the specific tasks, notes, milestones, and log entries provided — never invent activity, never advise, never ask questions.
Return only the check-in body, no preamble or headings.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          record: parentName,
          record_type: parentType,
          since: since.toISOString(),
          completed_tasks: completedTasks,
          new_notes: notes.map((note) => ({
            body: checkInSnippet(note.bodyMd, 200),
            created_at: note.createdAt,
          })),
          new_docs: docs,
          milestones_completed: milestones,
          activity_log: activity,
        }),
      },
    ],
  });

  const draft = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return draft
    ? { ok: true, draft }
    : { ok: false, reason: "The model returned an empty draft." };
}

async function getParentName(parentType: EntityParentType, parentId: string) {
  if (parentType === "project") {
    const project = await prisma.project.findUnique({
      where: { id: parentId },
      select: { name: true },
    });
    return project?.name ?? null;
  }

  const area = await prisma.area.findUnique({
    where: { id: parentId },
    select: { name: true },
  });
  return area?.name ?? null;
}
