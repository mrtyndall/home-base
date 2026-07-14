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

test("safeEndpoint rejects unverified HTTPS origins by default", () => {
  assert.throws(
    () => safeEndpoint("HOME_BASE_MCP_URL", "https://attacker.example/api/mcp", "/api/mcp"),
    /unverified host/i,
  );
  assert.throws(
    () => safeEndpoint("HOME_BASE_API_URL", "https://attacker.example/api/v1", "/api/v1"),
    /unverified host/i,
  );
});

test("safeEndpoint requires an explicit unsafe override for an unverified HTTPS origin", () => {
  assert.equal(
    safeEndpoint(
      "HOME_BASE_MCP_URL",
      "https://other-host.example/api/mcp",
      "/api/mcp",
      { unsafeAllowUnverifiedHost: true },
    ).origin,
    "https://other-host.example",
  );
});

test("unsafe host override never allows an unverified plaintext loopback origin", () => {
  assert.throws(
    () => safeEndpoint(
      "HOME_BASE_MCP_URL",
      "http://127.0.0.1:9999/api/mcp",
      "/api/mcp",
      { unsafeAllowUnverifiedHost: true },
    ),
    /unverified host/i,
  );
});

test("safeEndpoint accepts only the verified origins for each credential boundary", () => {
  assert.equal(
    safeEndpoint(
      "HOME_BASE_API_URL",
      "https://home-base-production-e3b7.up.railway.app/api/v1",
      "/api/v1",
    ).origin,
    "https://home-base-production-e3b7.up.railway.app",
  );
  assert.throws(
    () => safeEndpoint(
      "HOME_BASE_MCP_URL",
      "https://home-base-production-e3b7.up.railway.app/api/mcp",
      "/api/mcp",
    ),
    /unverified host/i,
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
      : request.name === "list_tasks"
        ? { tasks: [] }
      : { status: "ok" };
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
  };

  await runWriteSmoke(callTool);

  assert.deepEqual(calls.map((call) => call.name), [
    "list_tasks",
    "capture_input",
    "create_task",
    "complete_task",
    "list_tasks",
  ]);
  assert.equal(calls[1].arguments.captureIntent, "preserve_only");
  assert.equal(calls[1].arguments.idempotencyKey, "5b9f23d4-3e09-4f2f-8946-bdd621b4b5b2");
  assert.match(String(calls[1].arguments.rawText), /^\[HERMES-SMOKE\]/);
  assert.equal(calls[2].arguments.title, "[HERMES-SMOKE] Agent integration verification task");
  assert.deepEqual(calls[3].arguments, { taskId: "task-smoke-1" });
  assert.equal(calls.some((call) => call.name.includes("delete")), false);
});

test("write smoke completes a task after an ambiguous create response", async () => {
  let created = false;
  let completed = false;
  const calls: string[] = [];
  const callTool = async (request: { name: string; arguments: Record<string, unknown> }) => {
    calls.push(request.name);
    if (request.name === "list_tasks") {
      return toolResult({
        tasks: created && !completed
          ? [{ id: "ambiguous-task", title: "[HERMES-SMOKE] Agent integration verification task", status: "open" }]
          : [],
      });
    }
    if (request.name === "create_task") {
      created = true;
      throw new Error("create response lost");
    }
    if (request.name === "complete_task") completed = true;
    return toolResult({ status: "ok" });
  };

  await assert.rejects(runWriteSmoke(callTool), /create response lost/);
  assert.equal(completed, true);
  assert.deepEqual(calls, ["list_tasks", "capture_input", "create_task", "list_tasks", "complete_task"]);
});

test("write smoke de-duplicates matching task discovery during cleanup", async () => {
  const completed: string[] = [];
  let listCalls = 0;
  const callTool = async (request: { name: string; arguments: Record<string, unknown> }) => {
    if (request.name === "list_tasks") {
      listCalls += 1;
      return toolResult({
        tasks: [
          { id: "existing-task", title: "[HERMES-SMOKE] Agent integration verification task", status: "open" },
          { id: "existing-task", title: "[HERMES-SMOKE] Agent integration verification task", status: "open" },
        ],
      });
    }
    if (request.name === "create_task") return toolResult({ task: { id: "new-task" } });
    if (request.name === "complete_task") completed.push(String(request.arguments.taskId));
    return toolResult({ status: "ok" });
  };

  await runWriteSmoke(callTool);

  assert.equal(listCalls, 2);
  assert.deepEqual(completed.toSorted(), ["existing-task", "new-task"]);
});

test("write smoke paginates beyond 100 matching open tasks in both discovery passes", async () => {
  const existingTasks = Array.from({ length: 101 }, (_, index) => ({
    id: `existing-${index}`,
    title: "[HERMES-SMOKE] Agent integration verification task",
    status: "open",
  }));
  const cursors: Array<unknown> = [];
  const completed = new Set<string>();
  const callTool = async (request: { name: string; arguments: Record<string, unknown> }) => {
    if (request.name === "list_tasks") {
      const cursor = request.arguments.cursor;
      cursors.push(cursor);
      const start = typeof cursor === "string"
        ? existingTasks.findIndex((task) => task.id === cursor) + 1
        : 0;
      return toolResult({ tasks: existingTasks.slice(start, start + 100) });
    }
    if (request.name === "create_task") return toolResult({ task: { id: "new-task" } });
    if (request.name === "complete_task") completed.add(String(request.arguments.taskId));
    return toolResult({ status: "ok" });
  };

  await runWriteSmoke(callTool);

  assert.deepEqual(cursors, [undefined, "existing-99", undefined, "existing-99"]);
  assert.equal(completed.size, 102);
  for (const task of existingTasks) assert.equal(completed.has(task.id), true);
  assert.equal(completed.has("new-task"), true);
});

test("write smoke reports both the primary failure and cleanup failure", async () => {
  let created = false;
  const callTool = async (request: { name: string; arguments: Record<string, unknown> }) => {
    if (request.name === "list_tasks") {
      return toolResult({
        tasks: created
          ? [{ id: "cleanup-task", title: "[HERMES-SMOKE] Agent integration verification task", status: "open" }]
          : [],
      });
    }
    if (request.name === "create_task") {
      created = true;
      throw new Error("create response lost");
    }
    if (request.name === "complete_task") throw new Error("completion unavailable");
    return toolResult({ status: "ok" });
  };

  await assert.rejects(
    runWriteSmoke(callTool),
    (error: unknown) => {
      const message = String((error as Error).message);
      return message.includes("create response lost") &&
        message.includes("cleanup-task") &&
        message.includes("completion unavailable");
    },
  );
});

function toolResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}
