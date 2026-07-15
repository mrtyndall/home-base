import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { authenticateWorkerRole, hashWorkerToken } from "../src/lib/agent/auth";

const sorterToken = "sorter-api-test-token-that-is-longer-than-thirty-two";
const assistantToken = "assistant-api-test-token-that-is-longer-than-thirty-two";
const hashes = {
  sorter: hashWorkerToken(sorterToken),
  assistant: hashWorkerToken(assistantToken),
};

test("internal auth identifies role without trusting request JSON", () => {
  assert.equal(
    authenticateWorkerRole(
      new Request("https://example.invalid", {
        headers: { authorization: `Bearer ${assistantToken}` },
      }),
      hashes,
    ),
    "assistant",
  );
  assert.throws(() =>
    authenticateWorkerRole(
      new Request("https://example.invalid", {
        headers: { authorization: "Bearer invalid-token-that-is-still-long-enough-123" },
      }),
      hashes,
    ),
  );
});

test("internal routes delegate policy and never log authorization", () => {
  const files = [
    "src/app/api/internal/agent/jobs/claim/route.ts",
    "src/app/api/internal/agent/jobs/[jobId]/heartbeat/route.ts",
    "src/app/api/internal/agent/jobs/[jobId]/complete/route.ts",
    "src/app/api/internal/agent/jobs/[jobId]/fail/route.ts",
  ];
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.match(source, /authenticateWorkerRole/);
    assert.doesNotMatch(source, /console\.(log|error).*authorization/i);
  }
  const complete = readFileSync(join(process.cwd(), files[2]), "utf8");
  assert.match(complete, /completeWorkerJob/);
  assert.match(complete, /agentJobCompletionSchema/);

  const claim = readFileSync(join(process.cwd(), files[0]), "utf8");
  assert.ok(
    claim.indexOf("if (!isAgentWorkerEnabled(role))") <
      claim.indexOf("const claim = await claimNextWorkerJob"),
    "rollback flags must be checked before a job is claimed",
  );
});

test("completion provenance comes from the worker model and is persisted", () => {
  const queueClient = readFileSync(
    join(process.cwd(), "worker/src/queue-client.ts"),
    "utf8",
  );
  const jobs = readFileSync(join(process.cwd(), "src/lib/agent/jobs.ts"), "utf8");

  assert.match(queueClient, /model:\s*this\.config\.model/);
  assert.match(jobs, /data:\s*\{\s*model\s*\}/);
  assert.doesNotMatch(jobs, /HOME_BASE_CODEX_SORTER_MODEL|gpt-5\.4/);
});

test("app parses the complete claim envelope before responding", () => {
  const jobs = readFileSync(join(process.cwd(), "src/lib/agent/jobs.ts"), "utf8");
  assert.match(jobs, /agentJobClaimSchema\.parse/);
});
