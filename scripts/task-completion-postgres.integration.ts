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
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !loopbackHosts.has(parsed.hostname)
  ) {
    throw new Error("Task completion integration tests require a loopback PostgreSQL URL.");
  }
  if (!parsed.pathname.toLowerCase().includes("task_completion_test")) {
    throw new Error("Disposable database name must contain task_completion_test.");
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
  const prefix = `task-completion-${Date.now()}`;
  const title = `[CONCURRENCY] ${prefix}`;

  try {
    const { completeTaskById } = await import("../src/lib/tasks");

    const task = await admin.task.create({
      data: {
        title,
        dueDate: new Date("2026-07-14T00:00:00.000Z"),
        recurrenceRule: "FREQ=DAILY",
        source: "integration",
      },
    });

    await admin.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION task_completion_test_delay()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.25);
        RETURN NEW;
      END;
      $$
    `);
    await admin.$executeRawUnsafe(`
      CREATE TRIGGER task_completion_test_delay_trigger
      BEFORE UPDATE OF status ON tasks
      FOR EACH ROW
      WHEN (OLD.id = '${task.id}' AND NEW.status = 'completed')
      EXECUTE FUNCTION task_completion_test_delay()
    `);

    const results = await Promise.all([
      first.$transaction((tx) =>
        completeTaskById(task.id, { source: "api", label: "first" }, tx),
      ),
      second.$transaction((tx) =>
        completeTaskById(task.id, { source: "api", label: "second" }, tx),
      ),
    ]);

    assert.equal(results.filter((result) => result.nextInstance !== null).length, 1);
    assert.equal(results.filter((result) => result.nextInstance === null).length, 1);
    assert.ok(results.every((result) => result.completed.status === "completed"));

    assert.equal(await admin.task.count({ where: { id: task.id, status: "completed" } }), 1);
    assert.equal(
      await admin.task.count({
        where: { title, status: "open", source: "recurrence" },
      }),
      1,
      "concurrent completion must create exactly one recurrence successor",
    );
    assert.equal(
      await admin.notification.count({ where: { type: "task_completed", body: title } }),
      1,
      "concurrent completion must emit exactly one completion audit/notification",
    );

    console.log("Task completion PostgreSQL integration passed:");
    console.log("- concurrent callers claimed one open task exactly once");
    console.log("- exactly one recurrence successor and completion audit committed");
    console.log("- the losing caller received the completed task as a safe no-op");
  } finally {
    await admin.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS task_completion_test_delay_trigger ON tasks",
    ).catch(() => undefined);
    await admin.$executeRawUnsafe(
      "DROP FUNCTION IF EXISTS task_completion_test_delay()",
    ).catch(() => undefined);
    await admin.notification.deleteMany({ where: { body: title } }).catch(() => undefined);
    await admin.task.deleteMany({ where: { title } }).catch(() => undefined);
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
