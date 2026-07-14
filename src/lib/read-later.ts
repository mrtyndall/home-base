import { prisma } from "@/lib/db";
import {
  resolveVerifiedDestination,
} from "@/lib/destinations";
import {
  fetchReadLaterMetadata,
  type ReadLaterPageMetadata,
} from "@/lib/read-later-metadata";

export {
  createPinnedLookup,
  fetchReadLaterMetadata,
  isPublicMetadataAddress,
} from "@/lib/read-later-metadata";

export type ReadLaterStatus = "unread" | "read" | "archived";

export type ReadLaterFilingIntent =
  | { mode: "unchanged" }
  | { mode: "unfiled" }
  | { mode: "area"; areaId: string }
  | { mode: "project"; projectId: string };

export type CreateReadLaterInput = {
  url: string;
  filing?: ReadLaterFilingIntent;
  title?: string | null;
  body?: string | null;
  tags?: string[];
  source?: string | null;
  captureId?: string | null;
};

type ReadLaterRecord = {
  id: string;
  kind: string;
  url: string | null;
  normalizedUrl: string | null;
  title: string | null;
  body: string;
  metadata: unknown;
  tags: string[];
  areaId: string | null;
  projectId: string | null;
  readStatus: string;
  readAt: Date | null;
};

type ReferenceClient = {
  findFirst(args: { where: Record<string, unknown> }): PromiseLike<ReadLaterRecord | null>;
  create(args: { data: Record<string, unknown> }): PromiseLike<ReadLaterRecord>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): PromiseLike<ReadLaterRecord>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): PromiseLike<{ count: number }>;
};

export type ReadLaterClient = {
  area: {
    findFirst(args: unknown): PromiseLike<{ id: string } | null>;
  };
  project: {
    findFirst(args: unknown): PromiseLike<{ id: string; areaId: string | null } | null>;
  };
  reference: ReferenceClient;
  $transaction?<T>(operation: (client: { reference: ReferenceClient }) => Promise<T>): Promise<T>;
};

export type ReadLaterOptions = {
  scheduleEnrichment?: (job: () => Promise<void>) => void;
  fetchMetadata?: (url: string) => Promise<ReadLaterPageMetadata>;
  enrichmentClient?: ReadLaterClient;
};

const ACTIVE_READ_LATER_STATUSES: ReadLaterStatus[] = ["unread", "read"];
const TRACKING_PARAMETER = /^(utm_.+|fbclid|gclid|dclid|msclkid)$/i;
const CREATE_ATTEMPTS = 2;

function invalidUrl(): never {
  throw new Error("Enter a valid HTTP(S) URL.");
}

export function normalizeReadLaterUrl(raw: string) {
  const value = raw.trim();
  if (!value) invalidUrl();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidUrl();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") invalidUrl();

  url.hash = "";
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  const parameters = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMETER.test(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      compare(leftKey, rightKey) || compare(leftValue, rightValue),
    );
  url.search = "";
  for (const [key, value] of parameters) url.searchParams.append(key, value);
  return url.toString();
}

function metadataJson(metadata: ReadLaterPageMetadata) {
  const value = {
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(metadata.siteName ? { siteName: metadata.siteName } : {}),
  };
  return Object.keys(value).length ? value : undefined;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "P2002";
}

export function readLaterFilingDestination(filing: ReadLaterFilingIntent | undefined) {
  if (!filing || filing.mode === "unchanged") return {};
  if (filing.mode === "unfiled") return { areaId: null, projectId: null };
  if (filing.mode === "area") {
    if (!filing.areaId.trim()) throw new Error("Area not found.");
    return { areaId: filing.areaId, projectId: null };
  }
  if (!filing.projectId.trim()) throw new Error("Project not found.");
  return { areaId: null, projectId: filing.projectId };
}

async function applyExplicitDestination(
  item: ReadLaterRecord,
  destination: { areaId: string | null; projectId: string | null },
  client: ReadLaterClient,
) {
  if (item.areaId === destination.areaId && item.projectId === destination.projectId) return item;
  return client.reference.update({ where: { id: item.id }, data: destination });
}

function defaultScheduleEnrichment(job: () => Promise<void>) {
  queueMicrotask(() => { void job().catch(() => undefined); });
}

function scheduleMetadataEnrichment(
  item: ReadLaterRecord,
  input: CreateReadLaterInput,
  normalizedUrl: string,
  client: ReadLaterClient,
  options: ReadLaterOptions,
) {
  const fetchMetadata = options.fetchMetadata ?? fetchReadLaterMetadata;
  const schedule = options.scheduleEnrichment ?? defaultScheduleEnrichment;
  schedule(async () => {
    try {
      const metadata = await fetchMetadata(normalizedUrl);
      const json = metadataJson(metadata);
      const data = {
        ...(!input.title?.trim() && metadata.title ? { title: metadata.title } : {}),
        ...(!input.body?.trim() && metadata.description ? { body: metadata.description } : {}),
        ...(json ? { metadata: json } : {}),
      };
      if (Object.keys(data).length) {
        await (options.enrichmentClient ?? client).reference.update({ where: { id: item.id }, data });
      }
    } catch {
      return;
    }
  });
}

export async function createReadLater(
  input: CreateReadLaterInput,
  client: ReadLaterClient = prisma as unknown as ReadLaterClient,
  options: ReadLaterOptions = {},
) {
  const submittedUrl = input.url.trim();
  const normalizedUrl = normalizeReadLaterUrl(submittedUrl);
  const filing = input.filing ?? { mode: "unchanged" as const };
  const destination = await resolveVerifiedDestination(readLaterFilingDestination(filing), client);
  const explicitDestination = filing.mode !== "unchanged";
  const duplicateWhere = {
    kind: "read_later",
    normalizedUrl,
    readStatus: { in: ACTIVE_READ_LATER_STATUSES },
  };

  const resolveDuplicate = async () => {
    const duplicate = await client.reference.findFirst({ where: duplicateWhere });
    if (!duplicate) return null;
    return explicitDestination
      ? applyExplicitDestination(duplicate, destination, client)
      : duplicate;
  };
  const existing = await resolveDuplicate();
  if (existing) return existing;

  let saved: ReadLaterRecord | null = null;
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
    try {
      saved = await client.reference.create({
        data: {
          kind: "read_later",
          url: submittedUrl,
          normalizedUrl,
          title: input.title?.trim() || null,
          body: input.body?.trim() || submittedUrl,
          tags: input.tags ?? [],
          areaId: destination.areaId,
          projectId: destination.projectId,
          source: input.source ?? null,
          captureId: input.captureId ?? null,
        },
      });
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const racedDuplicate = await resolveDuplicate();
      if (racedDuplicate) return racedDuplicate;
      if (attempt === CREATE_ATTEMPTS - 1) throw error;
    }
  }
  if (!saved) throw new Error("Could not save Read Later item.");
  scheduleMetadataEnrichment(saved, input, normalizedUrl, client, options);
  return saved;
}

export async function setReadLaterStatus(
  id: string,
  status: ReadLaterStatus,
  client: ReadLaterClient = prisma as unknown as ReadLaterClient,
) {
  if (!(["unread", "read", "archived"] as string[]).includes(status)) {
    throw new Error("Invalid Read Later status.");
  }
  const operation = async (transaction: { reference: ReferenceClient }) => {
    if (status === "read") {
      await transaction.reference.updateMany({
        where: { id, kind: "read_later", readAt: null },
        data: { readStatus: "read", readAt: new Date() },
      });
      await transaction.reference.updateMany({
        where: { id, kind: "read_later", readAt: { not: null } },
        data: { readStatus: "read" },
      });
    } else {
      await transaction.reference.updateMany({
        where: { id, kind: "read_later" },
        data: status === "unread"
          ? { readStatus: "unread", readAt: null }
          : { readStatus: "archived" },
      });
    }
    const item = await transaction.reference.findFirst({
      where: { id, kind: "read_later" },
    });
    if (!item) throw new Error("Read Later item not found.");
    return item;
  };
  return client.$transaction ? client.$transaction(operation) : operation(client);
}
