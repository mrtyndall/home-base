import assert from "node:assert/strict";
import test from "node:test";
import {
  READ_PROBES,
  redactSensitive,
  runWriteSmoke,
  safeEndpoint,
  shouldRunWriteSmoke,
} from "./verify-agent-integration";

test("safeEndpoint accepts exact loopback and HTTPS integration routes", () => {
  assert.equal(
    safeEndpoint("HOME_BASE_API_URL", "http://127.0.0.1:3002/api/v1", "/api/v1").href,
    "http://127.0.0.1:3002/api/v1",
  );
  assert.equal(
    safeEndpoint(
      "HOME_BASE_MCP_URL",
      "https://mac-studio.tail3baa7a.ts.net:8443/api/mcp",
      "/api/mcp",
    ).href,
    "https://mac-studio.tail3baa7a.ts.net:8443/api/mcp",
  );
});

test("safeEndpoint rejects credential-bearing, ambiguous, and public HTTP URLs", () => {
  for (const value of [
    "https://user:password@example.test/api/mcp",
    "https://example.test/api/mcp?token=placeholder",
    "https://example.test/api/mcp#token",
    "http://example.test/api/mcp",
    "file:///api/mcp",
    "https://example.test/wrong",
  ]) {
    assert.throws(
      () => safeEndpoint("HOME_BASE_MCP_URL", value, "/api/mcp"),
      /HOME_BASE_MCP_URL/,
    );
  }
});

test("redactSensitive removes configured tokens, bearer values, and URL userinfo", () => {
  const token = "test-secret-placeholder";
  const output = redactSensitive(
    `failure ${token} Bearer another-secret at https://user:password@example.test/path`,
    [token],
  );

  assert.equal(output.includes(token), false);
  assert.equal(output.includes("another-secret"), false);
  assert.equal(output.includes("password"), false);
  assert.match(output, /\[REDACTED\]/);
});

test("write smoke is disabled unless explicitly enabled with a token", () => {
  assert.equal(shouldRunWriteSmoke({}, undefined), false);
  assert.equal(shouldRunWriteSmoke({ HOME_BASE_ENABLE_WRITE_SMOKE: "1" }, undefined), false);
  assert.equal(shouldRunWriteSmoke({ HOME_BASE_ENABLE_WRITE_SMOKE: "true" }, "placeholder"), false);
  assert.equal(shouldRunWriteSmoke({ HOME_BASE_ENABLE_WRITE_SMOKE: "1" }, "placeholder"), true);
});

test("read probes cover every documented read capability group without mutations", () => {
  assert.deepEqual(
    READ_PROBES.map((probe) => probe.name),
    [
      "all_clear_summary",
      "search",
      "list_captures",
      "list_tasks",
      "list_areas",
      "list_projects",
      "list_ideas",
      "list_references",
      "list_read_later",
      "calendar_read",
      "list_notifications",
      "list_entity_notes",
      "list_entity_docs",
      "list_milestones",
      "list_check_ins",
      "list_journal_entries",
      "read_resurfaced_item",
      "list_scheduled_reviews",
      "list_routines",
      "list_people",
    ],
  );
});

test("write smoke preserves a prefixed capture and completes its prefixed task", async () => {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const callTool = async (request: { name: string; arguments: Record<string, unknown> }) => {
    calls.push(request);
    const payload = request.name === "create_task"
      ? { task: { id: "task-smoke-1" } }
      : { status: "ok" };
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
  };

  await runWriteSmoke(callTool, new Date("2026-07-14T12:34:56.000Z"));

  assert.deepEqual(calls.map((call) => call.name), ["capture_input", "create_task", "complete_task"]);
  assert.match(String(calls[0].arguments.rawText), /^\[HERMES-SMOKE\]/);
  assert.match(String(calls[1].arguments.title), /^\[HERMES-SMOKE\]/);
  assert.deepEqual(calls[2].arguments, { taskId: "task-smoke-1" });
  assert.equal(calls.some((call) => call.name.includes("delete")), false);
});
