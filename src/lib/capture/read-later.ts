import {
  createReadLater,
  type ReadLaterClient,
  type ReadLaterFilingIntent,
  type ReadLaterOptions,
} from "@/lib/read-later";
import type { ExecutableAction } from "@/lib/capture/types";

type Action = Extract<ExecutableAction, { type: "save_read_later" }>;

export async function executeReadLaterCaptureAction(
  action: Action,
  context: {
    client: ReadLaterClient;
    enrichmentClient: ReadLaterClient;
    captureId: string;
    source: string;
    filing: ReadLaterFilingIntent;
    deferEnrichment(job: () => Promise<void>): void;
  },
  dependencies: {
    create: typeof createReadLater;
  } = { create: createReadLater },
) {
  const reference = await dependencies.create(
    {
      url: action.url,
      title: action.title,
      tags: action.tags,
      filing: context.filing,
      captureId: context.captureId,
      source: context.source,
    },
    context.client,
    {
      scheduleEnrichment: context.deferEnrichment,
      enrichmentClient: context.enrichmentClient,
    } satisfies ReadLaterOptions,
  );
  return { type: "reference" as const, id: reference.id, label: "Saved to Read Later" };
}
