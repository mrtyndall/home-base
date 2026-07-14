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
    throw new Error("Hierarchy integration tests require a loopback PostgreSQL URL.");
  }
  if (!parsed.pathname.toLowerCase().includes("hierarchy_cycle_test")) {
    throw new Error("Disposable database name must contain hierarchy_cycle_test.");
  }
  if (/railway|rlwy|supabase/i.test(testDatabaseUrl)) {
    throw new Error("Remote database URLs are forbidden for this integration harness.");
  }

  process.env.DATABASE_URL = testDatabaseUrl;
  const resources = Array.from({ length: 3 }, () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
    return { pool, client: new PrismaClient({ adapter: new PrismaPg(pool) }) };
  });
  const [admin, first, second] = resources.map(({ client }) => client);
  const prefix = `hierarchy-cycle-${Date.now()}`;
  const firstId = `${prefix}-a`;
  const secondId = `${prefix}-b`;

  try {
    const { patchAreaForApi } = await import("../src/lib/api/hierarchy");
    const { createCompatibleArea } = await import("../src/lib/area-compat");
    type BoundaryClient = Parameters<typeof patchAreaForApi>[3];

    await createCompatibleArea(admin, { id: firstId, name: "Concurrent A" });
    await createCompatibleArea(admin, { id: secondId, name: "Concurrent B" });
    await admin.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION hierarchy_cycle_test_delay()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.25);
        RETURN NEW;
      END;
      $$
    `);
    await admin.$executeRawUnsafe(`
      CREATE TRIGGER hierarchy_cycle_test_delay_trigger
      BEFORE UPDATE OF parent_area_id ON areas
      FOR EACH ROW EXECUTE FUNCTION hierarchy_cycle_test_delay()
    `);

    const notificationCountBefore = await admin.notification.count();
    const results = await Promise.allSettled([
      patchAreaForApi(firstId, { parentAreaId: secondId }, { label: "Concurrency test" }, first as BoundaryClient),
      patchAreaForApi(secondId, { parentAreaId: firstId }, { label: "Concurrency test" }, second as BoundaryClient),
    ]);

    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
      JSON.stringify(results.map((result) => result.status === "fulfilled"
        ? { status: result.status }
        : {
            status: result.status,
            name: (result.reason as { name?: string }).name,
            code: (result.reason as { code?: string }).code,
          })),
    );
    const rejection = results.find((result) => result.status === "rejected");
    assert.equal(rejection?.status, "rejected");
    if (rejection?.status === "rejected") {
      assert.equal((rejection.reason as { code?: string }).code, "cycle");
    }

    const persisted = await admin.area.findMany({
      where: { id: { in: [firstId, secondId] } },
      select: { id: true, parentAreaId: true },
    });
    const byId = new Map(persisted.map((area) => [area.id, area.parentAreaId]));
    assert.equal(
      Number(byId.get(firstId) === secondId) + Number(byId.get(secondId) === firstId),
      1,
      "exactly one reciprocal reparent may commit",
    );
    assert.equal(await admin.notification.count(), notificationCountBefore + 1);

    console.log("Area hierarchy PostgreSQL integration passed:");
    console.log("- reciprocal concurrent reparents serialized");
    console.log("- one mutation and its audit committed; the cycle was rejected");
  } finally {
    await admin.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS hierarchy_cycle_test_delay_trigger ON areas",
    ).catch(() => undefined);
    await admin.$executeRawUnsafe(
      "DROP FUNCTION IF EXISTS hierarchy_cycle_test_delay()",
    ).catch(() => undefined);
    await admin.area.updateMany({
      where: { id: { in: [firstId, secondId] } },
      data: { parentAreaId: null },
    }).catch(() => undefined);
    await admin.area.deleteMany({
      where: { id: { in: [firstId, secondId] } },
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
