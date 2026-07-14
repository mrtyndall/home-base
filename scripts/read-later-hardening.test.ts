import assert from "node:assert/strict";
import { test } from "node:test";
import * as readLaterModule from "../src/lib/read-later";

type MetadataAddress = { address: string; family: 4 | 6 };
type MetadataResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  cancel(): void;
};
type MetadataDependencies = {
  resolve(hostname: string): Promise<MetadataAddress[]>;
  request(url: URL, address: MetadataAddress, context?: { signal: AbortSignal; deadline: number }): Promise<MetadataResponse>;
  clock?: FakeClock;
  timeoutMs?: number;
};
type Metadata = { title?: string; description?: string; siteName?: string };
type ReadLaterApi = typeof readLaterModule & {
  isPublicMetadataAddress(address: string): boolean;
  createPinnedLookup(hostname: string, address: MetadataAddress): (
    hostname: string,
    options: { all?: boolean },
    callback: (error: Error | null, result?: unknown, family?: number) => void,
  ) => void;
  fetchReadLaterMetadata(url: string, dependencies: MetadataDependencies): Promise<Metadata>;
};
const readLater = readLaterModule as ReadLaterApi;

class FakeClock {
  private time = 0;
  private nextId = 1;
  private timers = new Map<number, { at: number; callback: () => void }>();

  now = () => this.time;

  setTimeout = (callback: () => void, delay: number) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + delay, callback });
    return id;
  };

  clearTimeout = (id: number) => { this.timers.delete(id); };

  advance(milliseconds: number) {
    this.time += milliseconds;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.at <= this.time)
      .sort((left, right) => left[1].at - right[1].at);
    for (const [id, timer] of due) {
      if (this.timers.delete(id)) timer.callback();
    }
  }
}

function response(
  chunks: Uint8Array[],
  options: { statusCode?: number; headers?: Record<string, string> } = {},
) {
  let cancelled = false;
  return {
    value: {
      statusCode: options.statusCode ?? 200,
      headers: options.headers ?? { "content-type": "text/html" },
      body: (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
      cancel() { cancelled = true; },
    } satisfies MetadataResponse,
    cancelled: () => cancelled,
  };
}

function page(html: string, options?: { statusCode?: number; headers?: Record<string, string> }) {
  return response([new TextEncoder().encode(html)], options);
}

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

function stored(overrides: Partial<StoredReference> = {}): StoredReference {
  return {
    id: "item-1",
    kind: "read_later",
    url: "https://example.com/story",
    normalizedUrl: "https://example.com/story",
    title: null,
    body: "https://example.com/story",
    metadata: null,
    tags: [],
    areaId: null,
    projectId: null,
    readStatus: "unread",
    readAt: null,
    ...overrides,
  };
}

function clientFixture(initial: StoredReference | null = null) {
  let current = initial;
  let createAttempts = 0;
  let p2002Failures = 0;
  let hiddenFinds = 0;
  let invalidArea = false;
  const calls = { area: 0, create: 0, update: [] as Array<Record<string, unknown>>, updateMany: [] as Array<Record<string, unknown>> };
  const reference = {
    async findFirst(args: { where: Record<string, unknown> }) {
      if (hiddenFinds > 0) { hiddenFinds -= 1; return null; }
      if (!current) return null;
      if (args.where.normalizedUrl && current.readStatus === "archived") return null;
      if (args.where.kind && current.kind !== args.where.kind) return null;
      return current;
    },
    async create(args: { data: Record<string, unknown> }) {
      calls.create += 1;
      createAttempts += 1;
      if (p2002Failures > 0) {
        p2002Failures -= 1;
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      current = stored({
        id: `created-${createAttempts}`,
        url: String(args.data.url),
        normalizedUrl: String(args.data.normalizedUrl),
        title: (args.data.title as string | null) ?? null,
        body: String(args.data.body),
        tags: (args.data.tags as string[]) ?? [],
        areaId: (args.data.areaId as string | null) ?? null,
        projectId: (args.data.projectId as string | null) ?? null,
      });
      return current;
    },
    async update(args: { data: Record<string, unknown> }) {
      calls.update.push(args.data);
      assert.ok(current);
      current = { ...current, ...args.data } as StoredReference;
      return current;
    },
    async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      calls.updateMany.push(args as unknown as Record<string, unknown>);
      if (!current || current.kind !== "read_later") return { count: 0 };
      const readAtFilter = args.where.readAt;
      if (readAtFilter === null && current.readAt !== null) return { count: 0 };
      if (typeof readAtFilter === "object" && readAtFilter && "not" in readAtFilter && current.readAt === null) return { count: 0 };
      current = { ...current, ...args.data } as StoredReference;
      return { count: 1 };
    },
  };
  const client = {
    area: {
      async findFirst() {
        calls.area += 1;
        return invalidArea ? null : { id: "area-1" };
      },
    },
    project: {
      async findFirst() { return { id: "project-1", areaId: "area-1" }; },
    },
    reference,
    async $transaction<T>(operation: (transaction: { reference: typeof reference }) => Promise<T>) {
      return operation({ reference });
    },
  };
  return {
    client,
    calls,
    current: () => current,
    failArea() { invalidArea = true; },
    failCreates(count: number) { p2002Failures = count; },
    hideFinds(count: number) { hiddenFinds = count; },
  };
}

test("URL query ordering is locale-independent code-unit ordering", () => {
  assert.equal(
    readLater.normalizeReadLaterUrl("https://example.com/?a=1&Z=1"),
    "https://example.com/?Z=1&a=1",
  );
});

test("metadata address policy rejects private, special, and mapped-private addresses", () => {
  const rejected = [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1",
    "172.16.0.1", "192.168.1.1", "192.0.2.1", "198.18.0.1", "224.0.0.1",
    "240.0.0.1", "::", "::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1",
    "::127.0.0.1", "64:ff9b::127.0.0.1", "64:ff9b:1::1", "2001:db8::1",
    "2002:7f00:1::1", "3fff::1", "5f00::1", "::ffff:127.0.0.1", "::ffff:192.168.1.1",
  ];
  for (const address of rejected) {
    assert.equal(readLater.isPublicMetadataAddress(address), false, address);
  }
  assert.equal(readLater.isPublicMetadataAddress("93.184.216.34"), true);
  assert.equal(readLater.isPublicMetadataAddress("2606:2800:220:1:248:1893:25c8:1946"), true);
});

test("metadata address policy rejects both boundaries of deprecated IPv6 site-local space", () => {
  assert.equal(readLater.isPublicMetadataAddress("fec0::"), false);
  assert.equal(readLater.isPublicMetadataAddress("feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), false);
});

test("one absolute deadline rejects DNS that never settles", async () => {
  const clock = new FakeClock();
  let requested = false;
  const operation = readLater.fetchReadLaterMetadata("https://example.net/hung-dns", {
    resolve: async () => new Promise<MetadataAddress[]>(() => undefined),
    request: async () => { requested = true; return page("").value; },
    clock,
    timeoutMs: 10,
  });
  await Promise.resolve();
  clock.advance(10);
  const outcome = await Promise.race([
    operation.then(() => "resolved", (error: Error) => error.message),
    new Promise<string>((resolve) => setTimeout(() => resolve("HARNESS_TIMEOUT"), 50)),
  ]);
  assert.equal(outcome, "Metadata request timed out.");
  assert.equal(requested, false);
});

test("continuous trickle traffic cannot extend the absolute deadline", async () => {
  const clock = new FakeClock();
  let cancelled = false;
  const trickle: MetadataResponse = {
    statusCode: 200,
    headers: { "content-type": "text/html" },
    body: (async function* () {
      for (let index = 0; index < 10; index += 1) {
        clock.advance(4);
        await Promise.resolve();
        yield new TextEncoder().encode("x");
      }
    })(),
    cancel() { cancelled = true; },
  };
  await assert.rejects(
    readLater.fetchReadLaterMetadata("https://example.net/trickle", {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => trickle,
      clock,
      timeoutMs: 10,
    }),
    /timed out/i,
  );
  assert.equal(cancelled, true);
});

test("metadata rejects special hosts and any hostname resolving partly private", async () => {
  const neverRequest = async () => { throw new Error("must not request"); };
  await assert.rejects(
    readLater.fetchReadLaterMetadata("http://localhost/story", {
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      request: neverRequest,
    }),
    /not allowed/i,
  );
  await assert.rejects(
    readLater.fetchReadLaterMetadata("https://public.example/story", {
      resolve: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.2", family: 4 },
      ],
      request: neverRequest,
    }),
    /not allowed/i,
  );
});

test("metadata pins the validated address and revalidates every redirect hop", async () => {
  const resolved: string[] = [];
  const requested: Array<{ host: string; address: string }> = [];
  const first = page("", { statusCode: 302, headers: { location: "https://cdn.example.net/final" } });
  const second = page("<title>Safe title</title>");
  const dependencies: MetadataDependencies = {
    async resolve(hostname) {
      resolved.push(hostname);
      return hostname === "start.example.net"
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "93.184.216.35", family: 4 }];
    },
    async request(url, address) {
      requested.push({ host: url.hostname, address: address.address });
      return requested.length === 1 ? first.value : second.value;
    },
  };

  const metadata = await readLater.fetchReadLaterMetadata("https://start.example.net/path", dependencies);

  assert.deepEqual(resolved, ["start.example.net", "cdn.example.net"]);
  assert.deepEqual(requested, [
    { host: "start.example.net", address: "93.184.216.34" },
    { host: "cdn.example.net", address: "93.184.216.35" },
  ]);
  assert.equal(first.cancelled(), true);
  assert.equal(metadata.title, "Safe title");
});

test("a redirect to a private address is rejected before the next request", async () => {
  let requests = 0;
  await assert.rejects(
    readLater.fetchReadLaterMetadata("https://start.example.net/path", {
      async resolve(hostname) {
        return hostname === "start.example.net"
          ? [{ address: "93.184.216.34", family: 4 }]
          : [{ address: "127.0.0.1", family: 4 }];
      },
      async request() {
        requests += 1;
        return page("", { statusCode: 302, headers: { location: "http://localhost/admin" } }).value;
      },
    }),
    /not allowed/i,
  );
  assert.equal(requests, 1);
});

test("the pinned lookup never performs a second DNS resolution", async () => {
  const lookup = readLater.createPinnedLookup("example.com", { address: "93.184.216.34", family: 4 });
  const invoke = () => new Promise<unknown>((resolve, reject) => {
    lookup("example.com", { all: true }, (error, result) => error ? reject(error) : resolve(result));
  });
  assert.deepEqual(await invoke(), [{ address: "93.184.216.34", family: 4 }]);
  assert.deepEqual(await invoke(), [{ address: "93.184.216.34", family: 4 }]);
  await assert.rejects(
    new Promise((resolve, reject) => lookup("changed.example", {}, (error, value) => error ? reject(error) : resolve(value))),
    /hostname changed/i,
  );
});

test("chunked metadata over 512KB is cancelled without buffering the remaining stream", async () => {
  let yielded = 0;
  let cancelled = false;
  const oversized: MetadataResponse = {
    statusCode: 200,
    headers: { "content-type": "text/html" },
    body: (async function* () {
      yielded += 1;
      yield new Uint8Array(400_000);
      yielded += 1;
      yield new Uint8Array(200_000);
      yielded += 1;
      yield new Uint8Array(10);
    })(),
    cancel() { cancelled = true; },
  };
  await assert.rejects(
    readLater.fetchReadLaterMetadata("https://example.net/large", {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => oversized,
    }),
    /too large/i,
  );
  assert.equal(cancelled, true);
  assert.equal(yielded, 2);
});

test("durable save returns before separately scheduled enrichment", async () => {
  const fixture = clientFixture();
  let job: (() => Promise<void>) | undefined;
  const result = await readLater.createReadLater(
    { url: "https://example.com/story" },
    fixture.client,
    {
      scheduleEnrichment(task: () => Promise<void>) { job = task; },
      fetchMetadata: async () => ({ title: "Later", description: "Summary" }),
    },
  );
  assert.equal(result.id, "created-1");
  assert.equal(fixture.calls.update.length, 0);
  assert.ok(job, "enrichment should be scheduled after persistence");
  await job();
  assert.deepEqual(fixture.calls.update[0], {
    title: "Later",
    body: "Summary",
    metadata: { description: "Summary" },
  });
});

test("an invalid explicit destination is rejected even when the URL is a duplicate", async () => {
  const fixture = clientFixture(stored());
  fixture.failArea();
  await assert.rejects(
    readLater.createReadLater({ url: "https://example.com/story", areaId: "missing" }, fixture.client),
    /Area not found/,
  );
  assert.equal(fixture.calls.area, 1);
});

test("an explicit valid destination refiles a duplicate while omission preserves it", async () => {
  const fixture = clientFixture(stored({ areaId: null }));
  const preserved = await readLater.createReadLater({ url: "https://example.com/story" }, fixture.client);
  assert.equal(preserved.areaId, null);
  assert.equal(fixture.calls.update.length, 0);

  const filed = await readLater.createReadLater(
    { url: "https://example.com/story", areaId: "area-1" },
    fixture.client,
  );
  assert.equal(filed.areaId, "area-1");
  assert.deepEqual(fixture.calls.update[0], { areaId: "area-1", projectId: null });
});

test("P2002 recovery retries a bounded archived requeue race", async () => {
  const fixture = clientFixture(stored({ readStatus: "archived" }));
  fixture.failCreates(1);
  const result = await readLater.createReadLater({ url: "https://example.com/story" }, fixture.client);
  assert.equal(result.id, "created-2");
  assert.equal(fixture.calls.create, 2);
});

test("P2002 recovery returns the concurrently-created active item", async () => {
  const fixture = clientFixture(stored({ id: "concurrent-1" }));
  fixture.hideFinds(1);
  fixture.failCreates(1);
  const result = await readLater.createReadLater({ url: "https://example.com/story" }, fixture.client);
  assert.equal(result.id, "concurrent-1");
  assert.equal(fixture.calls.create, 1);
});

test("concurrent mark-read calls establish readAt exactly once", async () => {
  const fixture = clientFixture(stored());
  const [left, right] = await Promise.all([
    readLater.setReadLaterStatus("item-1", "read", fixture.client),
    readLater.setReadLaterStatus("item-1", "read", fixture.client),
  ]);
  assert.ok(left.readAt instanceof Date);
  assert.equal(right.readAt?.getTime(), left.readAt.getTime());
  const initializationWrites = fixture.calls.updateMany.filter((call) => {
    const where = call.where as { readAt?: unknown };
    return where.readAt === null;
  });
  assert.equal(initializationWrites.length, 2, "both callers use a conditional readAt initialization");
  assert.equal(fixture.current()?.readAt?.getTime(), left.readAt.getTime());
});
