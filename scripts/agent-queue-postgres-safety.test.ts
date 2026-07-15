import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "scripts/agent-queue-postgres.integration.ts",
  "utf8",
);

test("agent queue integration accepts only an explicitly disposable loopback test database", () => {
  assert.match(source, /process\.env\.TEST_DATABASE_URL/);
  assert.match(source, /process\.env\.ALLOW_DISPOSABLE_DATABASE\s*!==\s*"1"/);
  assert.match(source, /agent_queue_test/);
  assert.match(source, /localhost/);
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /process\.env\.DATABASE_URL\s*=\s*testDatabaseUrl/);
  assert.doesNotMatch(
    source,
    /process\.env\.DATABASE_URL\s*\?\?/,
    "the canonical application database must never be accepted as the test target",
  );
  assert.doesNotMatch(
    source,
    /^import .*src\/lib\/(?:db|agent\/queue)/m,
    "database modules must load only after the verified test URL replaces DATABASE_URL",
  );
});
