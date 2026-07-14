import assert from "node:assert/strict";
import test from "node:test";

import { authenticateApiRequest } from "../src/lib/api/auth";
import { parseCaptureWithContext } from "../src/lib/capture/parser";
import { executeReadLaterCaptureAction } from "../src/lib/capture/read-later";
import {
  createReadLaterForApi,
  fileReferenceForApi,
  listReadLaterForApi,
  readReadLaterForApi,
  setReadLaterStatusForApi,
  toReadLaterApiError,
} from "../src/lib/api/read-later";
import { toReferenceSearchResult } from "../src/lib/reference-search-result";

const parserContext = {
  now: "2026-07-14T12:00:00.000Z",
  timezone: "America/New_York" as const,
  source: "test",
  areas: [],
  projects: [],
  recentIdeas: [],
};

test("explicit read later language is deterministic while a generic URL stays a Reference", async () => {
  const oldKey = process.env.ANTHROPIC_API_KEY;
  const oldModel = process.env.ANTHROPIC_PARSE_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_PARSE_MODEL;
  try {
    assert.deepEqual(
      await parseCaptureWithContext("read later https://Example.com/story?utm_source=inbox", parserContext),
      [{ type: "save_read_later", url: "https://Example.com/story?utm_source=inbox" }],
    );
    assert.deepEqual(
      await parseCaptureWithContext("https://example.com/story", parserContext),
      [{ type: "create_reference", body: "https://example.com/story", url: "https://example.com/story" }],
    );
  } finally {
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.ANTHROPIC_PARSE_MODEL;
    else process.env.ANTHROPIC_PARSE_MODEL = oldModel;
  }
});

test("capture execution persists through the shared boundary and defers enrichment until commit", async () => {
  const calls: string[] = [];
  let deferred: (() => Promise<void>) | undefined;
  const transactionClient = {};
  const enrichmentClient = {};
  const result = await executeReadLaterCaptureAction(
    { type: "save_read_later", url: "https://example.com/story", title: "Story" },
    {
      client: transactionClient as never,
      enrichmentClient: enrichmentClient as never,
      captureId: "capture-1",
      source: "capture",
      filing: { mode: "unfiled" },
      deferEnrichment(job) { deferred = job; calls.push("deferred"); },
    },
    {
      async create(input, client, options) {
        calls.push("created");
        assert.ok(options);
        assert.equal(client, transactionClient);
        assert.equal(options.enrichmentClient, enrichmentClient);
        assert.equal(input.captureId, "capture-1");
        assert.equal(input.source, "capture");
        options.scheduleEnrichment?.(async () => { calls.push("enriched"); });
        return { id: "read-1" } as never;
      },
    },
  );
  assert.deepEqual(result, { type: "reference", id: "read-1", label: "Saved to Read Later" });
  assert.deepEqual(calls, ["created", "deferred"]);
  await deferred?.();
  assert.deepEqual(calls, ["created", "deferred", "enriched"]);
});

test("REST authentication rejects a read-only key for writes and accepts it for lists", async () => {
  const key = {
    id: "key-1", label: "Hermes", tokenHash: "ignored", scopes: ["read"],
    rateLimit: 10, revokedAt: null, lastUsedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const client = {
    apiKey: {
      findUnique: async () => key,
      update: async () => key,
    },
  };
  const request = new Request("http://home.test/api/v1/read-later", {
    headers: { authorization: "Bearer test-token" },
  });
  await assert.rejects(
    authenticateApiRequest(request, "write", client as never),
    (error: unknown) => (error as { status?: number }).status === 403,
  );
  assert.equal((await authenticateApiRequest(request, "read", client as never)).label, "Hermes");
});

type Ref = {
  id: string; kind: string; url: string; normalizedUrl: string; title: string | null;
  body: string; metadata: unknown; tags: string[]; areaId: string | null;
  projectId: string | null; readStatus: string; readAt: Date | null; savedAt: Date;
};

function apiClient() {
  let reference: Ref | null = null;
  const notifications: Array<Record<string, unknown>> = [];
  const refs = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      reference?.id === where.id ? { ...reference } : null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      if (!reference) return null;
      if (where.id && where.id !== reference.id) return null;
      if (where.kind && where.kind !== reference.kind) return null;
      return { ...reference };
    },
    findMany: async () => reference ? [{ ...reference }] : [],
    create: async ({ data }: { data: Record<string, unknown> }) => {
      reference = {
        id: "read-1", kind: "read_later", url: String(data.url),
        normalizedUrl: String(data.normalizedUrl), title: data.title as string | null,
        body: String(data.body), metadata: null, tags: data.tags as string[],
        areaId: data.areaId as string | null, projectId: data.projectId as string | null,
        readStatus: "unread", readAt: null, savedAt: new Date("2026-07-14T12:00:00Z"),
      };
      return { ...reference };
    },
    update: async ({ data }: { where: { id: string }; data: Partial<Ref> }) => {
      assert.ok(reference);
      reference = { ...reference, ...data };
      return { ...reference };
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Ref> }) => {
      if (!reference || where.id !== reference.id || (where.kind && where.kind !== reference.kind)) return { count: 0 };
      if (where.readAt === null && reference.readAt !== null) return { count: 0 };
      if (where.readAt !== null && typeof where.readAt === "object" && reference.readAt === null) return { count: 0 };
      reference = { ...reference, ...data };
      return { count: 1 };
    },
  };
  const transaction = {
    area: { findFirst: async () => ({ id: "area-1" }) },
    project: { findFirst: async () => ({ id: "project-1", areaId: "area-1" }) },
    reference: refs,
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        notifications.push(data);
        return { id: `note-${notifications.length}`, ...data };
      },
    },
  };
  const client = {
    ...transaction,
    $transaction: async <T>(fn: (tx: typeof transaction) => Promise<T>) => fn(transaction),
  };
  return { client, notifications, getReference: () => reference };
}

test("REST boundary creates, lists, reads, files, and updates status with an audit per write", async () => {
  const fake = apiClient();
  const actor = { label: "Hermes" };
  const created = await createReadLaterForApi(
    { url: "https://example.com/post?utm_source=agent" }, actor,
    fake.client as never, { scheduleEnrichment() {} },
  );
  assert.equal(created.kind, "read_later");
  assert.equal(fake.notifications.length, 1);

  assert.equal((await listReadLaterForApi({}, fake.client as never)).length, 1);
  assert.equal((await readReadLaterForApi("read-1", fake.client as never)).id, "read-1");

  const filed = await fileReferenceForApi(
    "read-1", { mode: "project", projectId: "project-1" }, actor, fake.client as never,
  );
  assert.equal(filed.projectId, "project-1");
  const read = await setReadLaterStatusForApi("read-1", "read", actor, fake.client as never);
  assert.equal(read.readStatus, "read");
  assert.ok(read.readAt);
  assert.equal(fake.notifications.length, 3);
  assert.deepEqual(fake.notifications.map((item) => (item.sourceRef as { actor: string }).actor), [
    "Hermes", "Hermes", "Hermes",
  ]);
});

test("REST boundary returns stable public errors and never exposes internal failures", async () => {
  const invalid = toReadLaterApiError(new Error("Enter a valid HTTP(S) URL."));
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {
    error: { code: "invalid_read_later_url", message: "Enter a valid HTTP(S) URL." },
  });
  const missing = toReadLaterApiError(new Error("Read Later item not found."));
  assert.equal(missing.status, 404);
  const internal = toReadLaterApiError(new Error("database password was rejected"));
  assert.equal(internal.status, 500);
  assert.deepEqual(await internal.json(), {
    error: { code: "read_later_request_failed", message: "Read Later request failed." },
  });
});

test("Reference and Read Later search results always link to Reference detail", () => {
  assert.deepEqual(
    toReferenceSearchResult({
      id: "read-1", kind: "read_later", title: "A useful story", body: "Fallback",
      url: "https://example.com/story", readStatus: "unread",
    }),
    {
      type: "Read Later", id: "read-1", title: "A useful story",
      detail: "unread · https://example.com/story", href: "/references/read-1",
    },
  );
});
