import { prisma } from "@/lib/db";
import {
  resolveVerifiedDestination,
  type DestinationInput,
} from "@/lib/destinations";

export type ReadLaterStatus = "unread" | "read" | "archived";

export type CreateReadLaterInput = DestinationInput & {
  url: string;
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

type ReadLaterClient = {
  area: {
    findFirst(args: unknown): PromiseLike<{ id: string } | null>;
  };
  project: {
    findFirst(args: unknown): PromiseLike<{ id: string; areaId: string | null } | null>;
  };
  reference: {
    findFirst(args: unknown): PromiseLike<ReadLaterRecord | null>;
    create(args: { data: Record<string, unknown> }): PromiseLike<ReadLaterRecord>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): PromiseLike<ReadLaterRecord>;
  };
};

type PageMetadata = {
  title?: string;
  description?: string;
  siteName?: string;
};

const ACTIVE_READ_LATER_STATUSES: ReadLaterStatus[] = ["unread", "read"];
const TRACKING_PARAMETER = /^(utm_.+|fbclid|gclid|dclid|msclkid)$/i;
const METADATA_TIMEOUT_MS = 3_000;
const MAX_METADATA_HTML_BYTES = 512_000;

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
  const parameters = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMETER.test(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    );
  url.search = "";
  for (const [key, value] of parameters) url.searchParams.append(key, value);
  return url.toString();
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function findMetaContent(html: string, attribute: string, value: string) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = new RegExp(
    `<meta\\s+[^>]*${attribute}=["']${escapedValue}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i",
  ).exec(html)?.[1];
  if (first) return decodeHtml(first);
  return decodeHtml(new RegExp(
    `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*${attribute}=["']${escapedValue}["'][^>]*>`,
    "i",
  ).exec(html)?.[1] ?? "") || undefined;
}

async function fetchPageMetadata(url: string): Promise<PageMetadata> {
  const response = await fetch(url, {
    headers: { Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Metadata request failed.");
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) return {};
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_METADATA_HTML_BYTES) return {};

  const html = (await response.text()).slice(0, MAX_METADATA_HTML_BYTES);
  const documentTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    title: findMetaContent(html, "property", "og:title") ??
      (documentTitle ? decodeHtml(documentTitle) : undefined),
    description: findMetaContent(html, "property", "og:description") ??
      findMetaContent(html, "name", "description"),
    siteName: findMetaContent(html, "property", "og:site_name"),
  };
}

function metadataJson(metadata: PageMetadata) {
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

export async function createReadLater(
  input: CreateReadLaterInput,
  client: ReadLaterClient = prisma as unknown as ReadLaterClient,
) {
  const submittedUrl = input.url.trim();
  const normalizedUrl = normalizeReadLaterUrl(submittedUrl);
  const duplicateWhere = {
    kind: "read_later",
    normalizedUrl,
    readStatus: { in: ACTIVE_READ_LATER_STATUSES },
  };
  const existing = await client.reference.findFirst({ where: duplicateWhere });
  if (existing) return existing;

  const destination = await resolveVerifiedDestination(input, client);
  let pageMetadata: PageMetadata = {};
  try {
    pageMetadata = await fetchPageMetadata(normalizedUrl);
  } catch {
    // Saving the submitted URL is the durable operation; enrichment is optional.
  }

  const title = input.title?.trim() || pageMetadata.title || null;
  const body = input.body?.trim() || pageMetadata.description || submittedUrl;
  try {
    return await client.reference.create({
      data: {
        kind: "read_later",
        url: submittedUrl,
        normalizedUrl,
        title,
        body,
        tags: input.tags ?? [],
        metadata: metadataJson(pageMetadata),
        areaId: destination.areaId,
        projectId: destination.projectId,
        source: input.source ?? null,
        captureId: input.captureId ?? null,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const racedDuplicate = await client.reference.findFirst({ where: duplicateWhere });
    if (racedDuplicate) return racedDuplicate;
    throw error;
  }
}

export async function setReadLaterStatus(
  id: string,
  status: ReadLaterStatus,
  client: ReadLaterClient = prisma as unknown as ReadLaterClient,
) {
  if (!(["unread", "read", "archived"] as string[]).includes(status)) {
    throw new Error("Invalid Read Later status.");
  }
  const item = await client.reference.findFirst({
    where: { id, kind: "read_later" },
  });
  if (!item || item.kind !== "read_later") {
    throw new Error("Read Later item not found.");
  }

  const data: Record<string, unknown> = { readStatus: status };
  if (status === "unread") data.readAt = null;
  if (status === "read") data.readAt = item.readAt ?? new Date();
  return client.reference.update({ where: { id }, data });
}
