import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { submitCapture } from "../src/lib/capture/service";
import { prisma } from "../src/lib/db";

if (process.env.AREA_FIRST_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Set AREA_FIRST_DISPOSABLE_DATABASE=1 only for a disposable local database.");
}

const url = new URL(process.env.DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost" && url.hostname !== "::1") {
  throw new Error("Idempotency integration test only accepts a loopback database.");
}

const barrierKey = "731932759153968411";
const barrierTrigger = "task3_capture_barrier_trigger";
const barrierFunction = "task3_capture_barrier_fn";
const rollbackTrigger = "task3_capture_rollback_trigger";
const rollbackFunction = "task3_capture_rollback_fn";
const control = new Client({ connectionString: process.env.DATABASE_URL });

function assertUuid(value: string) {
  assert.match(value, /^[0-9a-f-]{36}$/i);
}

async function waitForAdvisoryWaiterCount(expected: number) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const result = await control.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND wait_event = 'advisory'
    `);
    const count = Number(result.rows[0]?.count ?? 0);
    if (count === expected) return count;
    if (count > expected) {
      throw new Error(`Expected ${expected} advisory lock waiter(s), observed ${count}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for ${expected} advisory lock waiter(s).`);
}

async function dropProbeTriggers() {
  await control.query(`DROP TRIGGER IF EXISTS ${barrierTrigger} ON tasks`);
  await control.query(`DROP FUNCTION IF EXISTS ${barrierFunction}()`);
  await control.query(`DROP TRIGGER IF EXISTS ${rollbackTrigger} ON tasks`);
  await control.query(`DROP FUNCTION IF EXISTS ${rollbackFunction}()`);
}

async function installBarrierTrigger(captureId: string) {
  assertUuid(captureId);
  await control.query(`
    CREATE FUNCTION ${barrierFunction}() RETURNS trigger
    LANGUAGE plpgsql AS $function$
    BEGIN
      IF NEW.capture_id = '${captureId}' THEN
        PERFORM pg_advisory_xact_lock(${barrierKey}::bigint);
      END IF;
      RETURN NEW;
    END
    $function$
  `);
  await control.query(`
    CREATE TRIGGER ${barrierTrigger}
    AFTER INSERT
    ON tasks
    FOR EACH ROW EXECUTE FUNCTION ${barrierFunction}()
  `);
}

async function installRollbackTrigger(captureId: string) {
  assertUuid(captureId);
  await control.query(`
    CREATE FUNCTION ${rollbackFunction}() RETURNS trigger
    LANGUAGE plpgsql AS $function$
    BEGIN
      IF NEW.capture_id = '${captureId}' THEN
        RAISE EXCEPTION 'task3 rollback probe';
      END IF;
      RETURN NEW;
    END
    $function$
  `);
  await control.query(`
    CREATE TRIGGER ${rollbackTrigger}
    AFTER INSERT
    ON tasks
    FOR EACH ROW EXECUTE FUNCTION ${rollbackFunction}()
  `);
}

async function main() {
  let barrierHeld = false;
  let firstRun: ReturnType<typeof submitCapture> | undefined;
  let secondRun: ReturnType<typeof submitCapture> | undefined;

  await control.connect();
  try {
    const concurrentId = randomUUID();
    const concurrentInput = {
      idempotencyKey: concurrentId,
      rawText: `Concurrency probe ${concurrentId}`,
      source: "in_app_text" as const,
      captureIntent: "task" as const,
    };

    await control.query("SELECT pg_advisory_lock($1::bigint)", [barrierKey]);
    barrierHeld = true;
    await installBarrierTrigger(concurrentId);

    firstRun = submitCapture(concurrentInput);
    firstRun.catch(() => undefined);
    assert.equal(await waitForAdvisoryWaiterCount(1), 1);

    secondRun = submitCapture(concurrentInput);
    secondRun.catch(() => undefined);
    assert.equal(await waitForAdvisoryWaiterCount(2), 2);

    const unlock = await control.query<{ unlocked: boolean }>(
      "SELECT pg_advisory_unlock($1::bigint) AS unlocked",
      [barrierKey],
    );
    assert.equal(unlock.rows[0]?.unlocked, true);
    barrierHeld = false;

    const [first, second] = await Promise.all([firstRun, secondRun]);
    assert.equal(first.captureId, concurrentId);
    assert.deepEqual(second, first);
    assert.equal(await prisma.capture.count({ where: { id: concurrentId } }), 1);
    assert.equal(await prisma.task.count({ where: { captureId: concurrentId } }), 1);

    await dropProbeTriggers();

    const areaId = randomUUID();
    const areaInsert = await control.query(
      `INSERT INTO areas (id, name, domain_id, updated_at)
       SELECT $1, $2, id, CURRENT_TIMESTAMP
       FROM domains
       ORDER BY is_system DESC
       LIMIT 1`,
      [areaId, `Rollback probe ${areaId}`],
    );
    assert.equal(areaInsert.rowCount, 1);
    const rollbackId = randomUUID();
    await installRollbackTrigger(rollbackId);

    await assert.rejects(
      submitCapture({
        idempotencyKey: rollbackId,
        rawText: `Rollback probe ${rollbackId}`,
        source: "in_app_text",
        captureIntent: "task",
        captureAreaId: areaId,
      }),
      /task3 rollback probe/,
    );
    assert.equal(await prisma.capture.count({ where: { id: rollbackId } }), 0);
    assert.equal(await prisma.task.count({ where: { captureId: rollbackId } }), 0);
  } finally {
    if (barrierHeld) {
      await control.query("SELECT pg_advisory_unlock($1::bigint)", [barrierKey]);
    }
    await Promise.allSettled([firstRun, secondRun].filter((run) => run !== undefined));
    await dropProbeTriggers();
    await control.end();
    await prisma.$disconnect();
  }
}

void main();
