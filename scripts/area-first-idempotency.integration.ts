import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { submitCapture } from "../src/lib/capture/service";
import { prisma } from "../src/lib/db";

if (process.env.AREA_FIRST_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Set AREA_FIRST_DISPOSABLE_DATABASE=1 only for a disposable local database.");
}

const url = new URL(process.env.DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost" && url.hostname !== "::1") {
  throw new Error("Idempotency integration test only accepts a loopback database.");
}

async function main() {
  const concurrentId = randomUUID();
  const concurrentInput = {
    idempotencyKey: concurrentId,
    rawText: `Concurrency probe ${concurrentId}`,
    source: "in_app_text" as const,
    captureIntent: "task" as const,
  };

  try {
  const [first, second] = await Promise.all([
    submitCapture(concurrentInput),
    submitCapture(concurrentInput),
  ]);
  assert.equal(first.captureId, concurrentId);
  assert.deepEqual(second, first);
  assert.equal(await prisma.capture.count({ where: { id: concurrentId } }), 1);
  assert.equal(await prisma.task.count({ where: { captureId: concurrentId } }), 1);

  const rollbackId = randomUUID();
  await assert.rejects(
    submitCapture({
      idempotencyKey: rollbackId,
      rawText: `Rollback probe ${rollbackId}`,
      source: "in_app_text",
      captureIntent: "task",
      captureAreaId: randomUUID(),
    }),
    /Area not found|Selected area no longer exists/,
  );
  assert.equal(await prisma.capture.count({ where: { id: rollbackId } }), 0);
  assert.equal(await prisma.task.count({ where: { captureId: rollbackId } }), 0);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
