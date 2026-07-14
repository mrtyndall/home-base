import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createReadLater,
  normalizeReadLaterUrl,
  setReadLaterStatus,
} from "../src/lib/read-later";

type StoredReference = {
  id: string;
  kind: string;
  url: string;
  normalizedUrl: string;
  title: string | null;
  body: string;
  metadata: unknown;
  tags: string[];
  areaId: string | null;
  projectId: string | null;
  readStatus: string;
  readAt: Date | null;
};

function makeClient(existing: StoredReference | null = null) {
  const calls: {
    findFirst: unknown[];
    create: Array<{ data: Record<string, unknown> }>;
    update: Array<{ where: unknown; data: Record<string, unknown> }>;
    updateMany: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>;
    area: unknown[];
    project: unknown[];
  } = { findFirst: [], create: [], update: [], updateMany: [], area: [], project: [] };
  let stored = existing;

  const reference = {
      async findFirst(args: { where: Record<string, unknown> }) {
        calls.findFirst.push(args);
        if (args.where.kind && stored?.kind !== args.where.kind) return null;
        return stored;
      },
      async create(args: { data: Record<string, unknown> }) {
        calls.create.push(args);
        stored = {
          id: "created-1",
          kind: "read_later",
          url: String(args.data.url),
          normalizedUrl: String(args.data.normalizedUrl),
          title: (args.data.title as string | null) ?? null,
          body: String(args.data.body),
          metadata: args.data.metadata ?? null,
          tags: (args.data.tags as string[]) ?? [],
          areaId: (args.data.areaId as string | null) ?? null,
          projectId: (args.data.projectId as string | null) ?? null,
          readStatus: "unread",
          readAt: null,
        };
        return stored;
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        calls.update.push(args);
        assert.ok(stored);
        stored = { ...stored, ...args.data } as StoredReference;
        return stored;
      },
      async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        calls.updateMany.push(args);
        if (!stored || (args.where.kind && stored.kind !== args.where.kind)) return { count: 0 };
        if (args.where.readAt === null && stored.readAt !== null) return { count: 0 };
        if (typeof args.where.readAt === "object" && args.where.readAt && stored.readAt === null) return { count: 0 };
        stored = { ...stored, ...args.data } as StoredReference;
        return { count: 1 };
      },
  };
  const client = {
    area: {
      async findFirst(args: unknown) {
        calls.area.push(args);
        return { id: "area-1" };
      },
    },
    project: {
      async findFirst(args: unknown) {
        calls.project.push(args);
        return { id: "project-1", areaId: "area-1" };
      },
    },
    reference,
    async $transaction<T>(operation: (transaction: { reference: typeof reference }) => Promise<T>) {
      return operation({ reference });
    },
  };

  return { client, calls, getStored: () => stored };
}

test("normalizes HTTP(S) URLs into a stable tracking-free identity", () => {
  assert.equal(
    normalizeReadLaterUrl(
      " HTTPS://Example.COM:443/path?utm_source=newsletter&b=2&fbclid=abc&a=3&a=1#section ",
    ),
    "https://example.com/path?a=1&a=3&b=2",
  );
  assert.equal(
    normalizeReadLaterUrl("http://Example.COM:80"),
    "http://example.com/",
  );
});

test("rejects missing URLs and non-HTTP(S) schemes", () => {
  assert.throws(() => normalizeReadLaterUrl(""), /valid HTTP\(S\) URL/);
  assert.throws(() => normalizeReadLaterUrl("ftp://example.com/file"), /HTTP\(S\)/);
  assert.throws(() => normalizeReadLaterUrl("javascript:alert(1)"), /HTTP\(S\)/);
});

test("returns an existing unread or read queue item instead of duplicating it", async () => {
  const existing: StoredReference = {
    id: "existing-1",
    kind: "read_later",
    url: "https://example.com/story",
    normalizedUrl: "https://example.com/story",
    title: "Existing",
    body: "Existing",
    metadata: null,
    tags: [],
    areaId: null,
    projectId: null,
    readStatus: "read",
    readAt: new Date("2026-07-14T12:00:00Z"),
  };
  const { client, calls } = makeClient(existing);

  const result = await createReadLater({ url: "https://EXAMPLE.com/story#later" }, client);

  assert.equal(result, existing);
  assert.equal(calls.create.length, 0);
  assert.deepEqual(calls.findFirst[0], {
    where: {
      kind: "read_later",
      normalizedUrl: "https://example.com/story",
      readStatus: { in: ["unread", "read"] },
    },
  });
});

test("validates the destination and preserves a URL when metadata enrichment fails", async () => {
  const { client, calls } = makeClient();
  const result = await createReadLater({
      url: "https://example.com/article?utm_medium=social",
      filing: { mode: "area", areaId: " area-1 " },
      tags: ["web"],
    }, client, { scheduleEnrichment() {} });

  assert.equal(result.url, "https://example.com/article?utm_medium=social");
  assert.equal(result.normalizedUrl, "https://example.com/article");
  assert.equal(result.body, "https://example.com/article?utm_medium=social");
  assert.equal(result.title, null);
  assert.equal(result.areaId, "area-1");
  assert.equal(calls.area.length, 1);
  assert.equal(calls.create.length, 1);
});

test("uses best-effort page metadata without overriding submitted content", async () => {
  const { client, calls } = makeClient();
  let enrichment: (() => Promise<void>) | undefined;
  const result = await createReadLater({
      url: "https://example.com/article",
      title: "My title",
    }, client, {
      scheduleEnrichment(job) { enrichment = job; },
      fetchMetadata: async () => ({
        title: "Fetched title",
        description: "Fetched summary",
        siteName: "Example News",
      }),
    });

  assert.equal(result.title, "My title");
  assert.equal(result.body, "https://example.com/article");
  assert.ok(enrichment);
  await enrichment();
  assert.deepEqual(calls.update[0].data, {
    body: "Fetched summary",
    metadata: { description: "Fetched summary", siteName: "Example News" },
  });
});

test("read status transitions keep readAt consistent and preserve it on archive", async () => {
  const item: StoredReference = {
    id: "item-1",
    kind: "read_later",
    url: "https://example.com",
    normalizedUrl: "https://example.com/",
    title: null,
    body: "https://example.com",
    metadata: null,
    tags: [],
    areaId: null,
    projectId: null,
    readStatus: "unread",
    readAt: null,
  };
  const { client, calls } = makeClient(item);

  const read = await setReadLaterStatus("item-1", "read", client);
  assert.equal(read.readStatus, "read");
  assert.ok(read.readAt instanceof Date);

  const archived = await setReadLaterStatus("item-1", "archived", client);
  assert.equal(archived.readStatus, "archived");
  assert.equal(archived.readAt, read.readAt);

  const unread = await setReadLaterStatus("item-1", "unread", client);
  assert.equal(unread.readStatus, "unread");
  assert.equal(unread.readAt, null);
  assert.deepEqual(calls.updateMany.at(-1)?.data, { readStatus: "unread", readAt: null });
});

test("status changes reject invalid states and non-read-later references", async () => {
  const ordinary = {
    ...makeClient().getStored(),
    id: "ordinary-1",
    kind: "reference",
  } as StoredReference;
  const { client } = makeClient(ordinary);

  await assert.rejects(
    setReadLaterStatus("ordinary-1", "read", client),
    /Read Later item not found/,
  );
  await assert.rejects(
    setReadLaterStatus("ordinary-1", "deleted" as never, client),
    /Invalid Read Later status/,
  );
});
