import { prisma } from "@/lib/db";
import { resolveVerifiedDestination } from "@/lib/destinations";
import {
  createReadLater,
  readLaterFilingDestination,
  setReadLaterStatus,
  type CreateReadLaterInput,
  type ReadLaterFilingIntent,
  type ReadLaterOptions,
  type ReadLaterStatus,
} from "@/lib/read-later";

type ApiActor = { label: string };
type ApiClient = typeof prisma;

async function audit(
  client: ApiClient,
  actor: ApiActor,
  type: string,
  title: string,
  referenceId: string,
) {
  await client.notification.create({
    data: {
      type,
      title,
      sourceRef: { type: "reference", id: referenceId, source: "api", actor: actor.label },
    },
  });
}

export async function listReadLaterForApi(
  input: { status?: ReadLaterStatus; limit?: number; cursor?: string },
  client: ApiClient = prisma,
) {
  return client.reference.findMany({
    where: { kind: "read_later", readStatus: input.status ?? "unread" },
    include: { area: true, project: true },
    orderBy: { savedAt: "desc" },
    take: input.limit ?? 50,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
}

export async function readReadLaterForApi(id: string, client: ApiClient = prisma) {
  const item = await client.reference.findFirst({
    where: { id, kind: "read_later" },
    include: { area: true, project: true },
  });
  if (!item) throw new Error("Read Later item not found.");
  return item;
}

export async function createReadLaterForApi(
  input: CreateReadLaterInput,
  actor: ApiActor,
  client: ApiClient = prisma,
  options: ReadLaterOptions = {},
) {
  const enrichmentJobs: Array<() => Promise<void>> = [];
  const reference = await client.$transaction(async (transaction) => {
    const saved = await createReadLater(
      { ...input, source: `api:${actor.label}` },
      transaction as never,
      {
        ...options,
        enrichmentClient: client as never,
        scheduleEnrichment(job) { enrichmentJobs.push(job); },
      },
    );
    await audit(transaction as ApiClient, actor, "read_later_saved", "Read Later item saved", saved.id);
    return saved;
  });
  const schedule = options.scheduleEnrichment ?? ((job: () => Promise<void>) => {
    queueMicrotask(() => { void job().catch(() => undefined); });
  });
  for (const job of enrichmentJobs) schedule(job);
  return reference;
}

export async function fileReferenceForApi(
  id: string,
  filing: Exclude<ReadLaterFilingIntent, { mode: "unchanged" }>,
  actor: ApiActor,
  client: ApiClient = prisma,
) {
  return client.$transaction(async (transaction) => {
    const tx = transaction as ApiClient;
    const existing = await tx.reference.findUnique({ where: { id } });
    if (!existing) throw new Error("Reference not found.");
    const destination = await resolveVerifiedDestination(
      readLaterFilingDestination(filing),
      tx,
    );
    const reference = await tx.reference.update({ where: { id }, data: destination });
    await audit(tx, actor, "reference_filed", "Reference filed", reference.id);
    return reference;
  });
}

export async function setReadLaterStatusForApi(
  id: string,
  status: ReadLaterStatus,
  actor: ApiActor,
  client: ApiClient = prisma,
) {
  return client.$transaction(async (transaction) => {
    const tx = transaction as ApiClient;
    const reference = await setReadLaterStatus(id, status, tx as never);
    await audit(tx, actor, "read_later_status_changed", "Read Later status changed", reference.id);
    return reference;
  });
}

export function toReadLaterApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Enter a valid HTTP(S) URL.") {
    return Response.json(
      { error: { code: "invalid_read_later_url", message } },
      { status: 400 },
    );
  }
  if (message === "Invalid Read Later status.") {
    return Response.json(
      { error: { code: "invalid_read_later_status", message } },
      { status: 400 },
    );
  }
  if (message === "Read Later item not found." || message === "Reference not found.") {
    return Response.json(
      { error: { code: "reference_not_found", message } },
      { status: 404 },
    );
  }
  if (/^(Area|Project) not found\.$/.test(message) || message.includes("selected Area")) {
    return Response.json(
      { error: { code: "filing_destination_not_found", message: "Filing destination not found." } },
      { status: 404 },
    );
  }
  return Response.json(
    { error: { code: "read_later_request_failed", message: "Read Later request failed." } },
    { status: 500 },
  );
}
