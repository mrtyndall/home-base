import type { ReadLaterFilingIntent, ReadLaterStatus } from "@/lib/read-later";
import { readLaterFilingDestination } from "@/lib/read-later";

export type ReadLaterMutationResult =
  | { ok: true; error: null }
  | { ok: false; error: string };

type ReferenceDestination = {
  id: string;
  areaId: string | null;
  projectId: string | null;
};

export async function performReadLaterStatusMutation(
  input: { referenceId: string; status: ReadLaterStatus },
  dependencies: {
    setStatus(id: string, status: ReadLaterStatus): Promise<ReferenceDestination>;
    revalidate(reference: ReferenceDestination): void;
  },
): Promise<ReadLaterMutationResult> {
  if (!input.referenceId.trim()) {
    return { ok: false, error: "This Read Later item is no longer available." };
  }
  try {
    const reference = await dependencies.setStatus(input.referenceId, input.status);
    dependencies.revalidate(reference);
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Could not update this Read Later item. Try again." };
  }
}

export async function performReadLaterFilingMutation(
  input: {
    referenceId: string;
    filing: Exclude<ReadLaterFilingIntent, { mode: "unchanged" }>;
  },
  dependencies: {
    findReference(id: string): Promise<ReferenceDestination | null>;
    resolveDestination(
      input: { areaId?: string | null; projectId?: string | null },
    ): Promise<{ areaId: string | null; projectId: string | null }>;
    updateReference(
      id: string,
      destination: { areaId: string | null; projectId: string | null },
    ): Promise<ReferenceDestination>;
    revalidate(reference: ReferenceDestination): void;
  },
): Promise<ReadLaterMutationResult> {
  if (!input.referenceId.trim()) {
    return { ok: false, error: "This Read Later item is no longer available." };
  }
  try {
    const current = await dependencies.findReference(input.referenceId);
    if (!current) {
      return { ok: false, error: "This Read Later item is no longer available." };
    }
    const destination = await dependencies.resolveDestination(
      readLaterFilingDestination(input.filing),
    );
    const reference = await dependencies.updateReference(current.id, destination);
    dependencies.revalidate(current);
    dependencies.revalidate(reference);
    return { ok: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/Area not found|Project not found|selected Area/.test(message)) {
      return { ok: false, error: "That filing destination is no longer available." };
    }
    return { ok: false, error: "Could not update this filing. Try again." };
  }
}
