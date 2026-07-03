"use server";

import { revalidatePath } from "next/cache";
import type { EntityParentType } from "@prisma/client";
import {
  createCheckInRecord,
  draftCheckInFromActivity,
  type SummarizeDraftResult,
} from "@/lib/checkins";

export type PostCheckInResult =
  | { ok: true }
  | { ok: false; message: string };

function normalizeParentType(value: unknown): EntityParentType | null {
  return value === "area" || value === "project" ? value : null;
}

export async function postCheckIn(input: {
  parentType: string;
  parentId: string;
  bodyMd: string;
  draft?: string | null;
}): Promise<PostCheckInResult> {
  const parentType = normalizeParentType(input.parentType);
  const parentId = typeof input.parentId === "string" ? input.parentId : "";
  const bodyMd = typeof input.bodyMd === "string" ? input.bodyMd.trim() : "";
  if (!parentType || !parentId || !bodyMd) {
    return { ok: false, message: "Nothing to post." };
  }

  const draft = typeof input.draft === "string" ? input.draft.trim() : null;
  const source = draft
    ? bodyMd === draft
      ? ("ai_draft" as const)
      : ("ai_draft_edited" as const)
    : ("manual" as const);

  try {
    await createCheckInRecord(
      { parentType, parentId, bodyMd, source },
      { source: "manual" },
    );
  } catch {
    return { ok: false, message: "Check-in could not be posted." };
  }

  revalidatePath("/projects");
  revalidatePath(
    parentType === "project" ? `/projects/${parentId}` : `/areas/${parentId}`,
  );
  return { ok: true };
}

export async function requestCheckInDraft(input: {
  parentType: string;
  parentId: string;
}): Promise<SummarizeDraftResult> {
  const parentType = normalizeParentType(input.parentType);
  const parentId = typeof input.parentId === "string" ? input.parentId : "";
  if (!parentType || !parentId) {
    return { ok: false, reason: "Record not found." };
  }

  try {
    return await draftCheckInFromActivity(parentType, parentId);
  } catch {
    return { ok: false, reason: "Drafting failed. The capture is unaffected." };
  }
}
