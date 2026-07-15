import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  WorkerAuthError,
  authenticateWorkerRole,
  authenticateWorkerRequest,
  hashWorkerToken,
} from "../src/lib/agent/auth";
import { retryDelayMs } from "../src/lib/agent/queue";

const root = process.cwd();

test("worker auth is role-specific and constant-shape", () => {
  const sorterToken = "sorter-test-token-that-is-longer-than-thirty-two";
  const assistantToken = "assistant-test-token-that-is-longer-than-thirty-two";
  const hashes = {
    sorter: hashWorkerToken(sorterToken),
    assistant: hashWorkerToken(assistantToken),
  };

  assert.equal(
    authenticateWorkerRequest(
      new Request("https://example.invalid", {
        headers: { authorization: `Bearer ${sorterToken}` },
      }),
      "sorter",
      hashes,
    ),
    "sorter",
  );

  assert.throws(
    () =>
      authenticateWorkerRequest(
        new Request("https://example.invalid", {
          headers: { authorization: `Bearer ${sorterToken}` },
        }),
        "assistant",
        hashes,
      ),
    (error: unknown) =>
      error instanceof WorkerAuthError && error.status === 401,
  );
});

test("ambiguous role credentials fail closed", () => {
  const sharedToken = "shared-test-token-that-is-longer-than-thirty-two";
  const sharedHash = hashWorkerToken(sharedToken);
  assert.throws(
    () =>
      authenticateWorkerRole(
        new Request("https://example.invalid", {
          headers: { authorization: `Bearer ${sharedToken}` },
        }),
        { sorter: sharedHash, assistant: sharedHash },
      ),
    (error: unknown) =>
      error instanceof WorkerAuthError && error.status === 503,
  );
});

test("weak and missing worker credentials fail closed", () => {
  assert.throws(() => hashWorkerToken("too-short"));
  assert.throws(() =>
    authenticateWorkerRequest(
      new Request("https://example.invalid"),
      "sorter",
      { sorter: "", assistant: "" },
    ),
  );
});

test("schema and migration define durable leased jobs and immutable records", () => {
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    join(root, "prisma/migrations/20260714150000_codex_workers/migration.sql"),
    "utf8",
  );

  assert.match(schema, /model AgentJob/);
  assert.match(schema, /idempotencyKey\s+String\s+@unique/);
  assert.match(schema, /leaseTokenHash\s+String\?/);
  assert.match(schema, /model ChatThread/);
  assert.match(schema, /model ChatMessage/);
  assert.match(schema, /model CaptureRoutingFeedback/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /prevent_agent_jobs_delete/);
  assert.match(migration, /prevent_chat_messages_delete/);
  assert.match(migration, /prevent_capture_routing_feedback_delete/);
  assert.match(migration, /reconcile_terminal_agent_job/);
  assert.match(migration, /NEW\."status" = 'dead_letter'/);
  assert.match(migration, /UPDATE "chat_messages"/);
});

test("retry backoff is bounded and exponential", () => {
  assert.equal(retryDelayMs(1), 5_000);
  assert.equal(retryDelayMs(2), 10_000);
  assert.equal(retryDelayMs(10), 600_000);
  assert.equal(retryDelayMs(100), 600_000);
});
