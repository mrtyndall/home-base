import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type BookLoreSnippetSyncResult =
  | { ok: true; synced: number; skipped: number }
  | { ok: false; reason: string };

type NormalizedSnippet = {
  providerId: string;
  kind: "highlight" | "note";
  quote: string;
  note: string | null;
  location: string | null;
  color: string | null;
  tags: string[];
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  metadata: Prisma.InputJsonObject;
};

export async function syncBookLoreSnippetsForReference(
  referenceId: string,
): Promise<BookLoreSnippetSyncResult> {
  const reference = await prisma.reference.findUnique({
    where: { id: referenceId },
    select: { id: true, title: true, metadata: true, sourcePath: true },
  });
  if (!reference) {
    return { ok: false, reason: "Reference not found." };
  }

  const bookLoreId = extractBookLoreId(reference);
  if (!bookLoreId) {
    return { ok: false, reason: "Reference is not linked to BookLore." };
  }

  const baseUrl = process.env.BOOKLORE_BASE_URL?.replace(/\/$/, "");
  const token = process.env.BOOKLORE_TOKEN;
  if (!baseUrl || !token) {
    return { ok: false, reason: "BookLore is not configured." };
  }

  const [annotations, notes] = await Promise.all([
    fetchBookLoreArray(
      `${baseUrl}/api/v1/annotations/book/${bookLoreId}`,
      token,
    ),
    fetchBookLoreArray(`${baseUrl}/api/v2/book-notes/book/${bookLoreId}`, token),
  ]);

  if (!annotations.ok) return annotations;
  if (!notes.ok) return notes;

  const normalized = [
    ...annotations.items
      .map((item) => normalizeAnnotation(item))
      .filter(isNormalizedSnippet),
    ...notes.items.map((item) => normalizeNote(item)).filter(isNormalizedSnippet),
  ];

  let synced = 0;
  let skipped = 0;
  const syncedAt = new Date();

  for (const snippet of normalized) {
    if (!snippet.quote.trim()) {
      skipped += 1;
      continue;
    }

    await prisma.referenceSnippet.upsert({
      where: {
        provider_providerId: {
          provider: "booklore",
          providerId: snippet.providerId,
        },
      },
      update: {
        referenceId: reference.id,
        kind: snippet.kind,
        quote: snippet.quote,
        note: snippet.note,
        location: snippet.location,
        color: snippet.color,
        tags: snippet.tags,
        metadata: snippet.metadata,
        sourceCreatedAt: snippet.sourceCreatedAt,
        sourceUpdatedAt: snippet.sourceUpdatedAt,
        syncedAt,
      },
      create: {
        referenceId: reference.id,
        provider: "booklore",
        providerId: snippet.providerId,
        kind: snippet.kind,
        quote: snippet.quote,
        note: snippet.note,
        location: snippet.location,
        color: snippet.color,
        tags: snippet.tags,
        metadata: snippet.metadata,
        sourceCreatedAt: snippet.sourceCreatedAt,
        sourceUpdatedAt: snippet.sourceUpdatedAt,
        syncedAt,
      },
    });
    synced += 1;
  }

  return { ok: true, synced, skipped };
}

function extractBookLoreId(reference: {
  metadata: unknown;
  sourcePath: string | null;
}) {
  const metadata =
    typeof reference.metadata === "object" &&
    reference.metadata !== null &&
    !Array.isArray(reference.metadata)
      ? (reference.metadata as Record<string, unknown>)
      : {};
  const metadataId =
    stringValue(metadata.bookloreId) ?? stringValue(metadata.sourceId);
  if (metadata.source === "BookLore" && metadataId) return metadataId;
  if (reference.sourcePath?.startsWith("booklore:")) {
    return reference.sourcePath.slice("booklore:".length);
  }
  return null;
}

async function fetchBookLoreArray(
  url: string,
  token: string,
): Promise<
  | { ok: true; items: Array<Record<string, unknown>> }
  | { ok: false; reason: string }
> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return { ok: false, reason: "BookLore snippet sync failed." };
    }

    const body = await response.json();
    if (Array.isArray(body)) {
      return { ok: true, items: body.filter(isRecord) };
    }
    if (isRecord(body)) {
      const values = [
        body.content,
        body.items,
        body.notes,
        body.annotations,
        body.data,
      ].find(Array.isArray);
      return { ok: true, items: values?.filter(isRecord) ?? [] };
    }
    return { ok: true, items: [] };
  } catch {
    return { ok: false, reason: "BookLore snippet sync failed." };
  }
}

function normalizeAnnotation(
  value: Record<string, unknown>,
): NormalizedSnippet | null {
  const id = stringValue(value.id) ?? stringValue(value.uuid);
  const quote = firstString(
    value.selectedText,
    value.highlightedText,
    value.text,
    value.quote,
    value.content,
  );
  if (!id || !quote) return null;

  return {
    providerId: `annotation:${id}`,
    kind: "highlight",
    quote,
    note: firstString(value.note, value.comment, value.annotation, value.body),
    location: firstString(
      value.page,
      value.pageNumber,
      value.position,
      value.locator,
      value.cfi,
      value.epubCfi,
    ),
    color: firstString(value.color, value.style),
    tags: stringArray(value.tags),
    sourceCreatedAt: dateValue(value.createdAt ?? value.created_at),
    sourceUpdatedAt: dateValue(value.updatedAt ?? value.updated_at),
    metadata: pruneJson({
      bookLoreType: "annotation",
      chapter: firstString(value.chapter, value.chapterTitle),
      rawId: id,
    }),
  };
}

function normalizeNote(value: Record<string, unknown>): NormalizedSnippet | null {
  const id = stringValue(value.id) ?? stringValue(value.uuid);
  const note = firstString(value.note, value.body, value.content, value.text);
  if (!id || !note) return null;

  return {
    providerId: `note:${id}`,
    kind: "note",
    quote: note,
    note: null,
    location: firstString(
      value.page,
      value.pageNumber,
      value.position,
      value.locator,
      value.cfi,
      value.epubCfi,
    ),
    color: null,
    tags: stringArray(value.tags),
    sourceCreatedAt: dateValue(value.createdAt ?? value.created_at),
    sourceUpdatedAt: dateValue(value.updatedAt ?? value.updated_at),
    metadata: pruneJson({
      bookLoreType: "note",
      title: firstString(value.title, value.heading),
      rawId: id,
    }),
  };
}

function isNormalizedSnippet(
  value: NormalizedSnippet | null,
): value is NormalizedSnippet {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function stringValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(stringValue)
    .filter((item): item is string => Boolean(item));
}

function dateValue(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pruneJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== null && item !== undefined,
    ),
  ) as Prisma.InputJsonObject;
}
