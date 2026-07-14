import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

async function main() {
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required.");
if (process.env.ALLOW_DISPOSABLE_DATABASE !== "1") {
  throw new Error("ALLOW_DISPOSABLE_DATABASE=1 is required.");
}

const parsed = new URL(testDatabaseUrl);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !loopbackHosts.has(parsed.hostname)) {
  throw new Error("Read Later integration tests require a loopback PostgreSQL URL.");
}
if (!parsed.pathname.toLowerCase().includes("read_later_test")) {
  throw new Error("Disposable database name must contain read_later_test.");
}
if (/railway|rlwy|supabase/i.test(testDatabaseUrl)) {
  throw new Error("Remote database URLs are forbidden for this integration harness.");
}

process.env.DATABASE_URL = testDatabaseUrl;

const resources = Array.from({ length: 4 }, () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
  return { pool, client: new PrismaClient({ adapter: new PrismaPg(pool) }) };
});
const [admin, first, second, third] = resources.map(({ client }) => client);
const prefix = `read-later-integration-${Date.now()}`;
const noEnrichment = { scheduleEnrichment() {} };

try {
  const { createReadLater, setReadLaterStatus } = await import("../src/lib/read-later");
  type BoundaryClient = Parameters<typeof createReadLater>[1];
  type StatusClient = Parameters<typeof setReadLaterStatus>[2];

  const duplicateUrl = `https://example.com/${prefix}/duplicate`;
  const duplicateResults = await Promise.all([
    createReadLater({ url: duplicateUrl }, first as unknown as BoundaryClient, noEnrichment),
    createReadLater({ url: duplicateUrl }, second as unknown as BoundaryClient, noEnrichment),
  ]);
  assert.equal(duplicateResults[0].id, duplicateResults[1].id);
  assert.equal(await admin.reference.count({
    where: { normalizedUrl: duplicateUrl, readStatus: { in: ["unread", "read"] } },
  }), 1);

  const archivedId = duplicateResults[0].id;
  await setReadLaterStatus(archivedId, "archived", first as unknown as StatusClient);
  const requeueResults = await Promise.all([
    createReadLater({ url: duplicateUrl }, second as unknown as BoundaryClient, noEnrichment),
    createReadLater({ url: duplicateUrl }, third as unknown as BoundaryClient, noEnrichment),
  ]);
  assert.equal(requeueResults[0].id, requeueResults[1].id);
  assert.notEqual(requeueResults[0].id, archivedId);
  assert.equal(await admin.reference.count({
    where: { normalizedUrl: duplicateUrl, readStatus: { in: ["unread", "read"] } },
  }), 1);
  assert.equal(await admin.reference.count({ where: { normalizedUrl: duplicateUrl } }), 2);

  const readUrl = `https://example.com/${prefix}/read-at`;
  const unread = await createReadLater(
    { url: readUrl },
    admin as unknown as BoundaryClient,
    noEnrichment,
  );
  const readResults = await Promise.all([
    setReadLaterStatus(unread.id, "read", first as unknown as StatusClient),
    setReadLaterStatus(unread.id, "read", second as unknown as StatusClient),
    setReadLaterStatus(unread.id, "read", third as unknown as StatusClient),
  ]);
  const persisted = await admin.reference.findUniqueOrThrow({ where: { id: unread.id } });
  assert.ok(persisted.readAt);
  for (const result of readResults) {
    assert.equal(result.readAt?.getTime(), persisted.readAt.getTime());
  }

  console.log("Read Later PostgreSQL integration passed:");
  console.log("- concurrent active duplicate creation converged on one row");
  console.log("- archive plus concurrent requeue retained history and one active row");
  console.log("- three concurrent first-read transitions preserved one readAt timestamp");
} finally {
  await admin.reference.deleteMany({
    where: { normalizedUrl: { startsWith: `https://example.com/${prefix}/` } },
  }).catch(() => undefined);
  await Promise.all(resources.map(async ({ client, pool }) => {
    await client.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }));
}
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
