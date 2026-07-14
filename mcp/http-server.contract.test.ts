import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { registerTools } from "./http-server";
import { apiPath } from "./proxy-path";
import { TOOL_CONTRACTS } from "./http-server.contract-manifest";

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;
type ToolRegistration = {
  name: string;
  config: { description?: string; inputSchema?: { safeParse(input: unknown): { success: boolean } } };
  handler: ToolHandler;
};

function collectTools() {
  const registrations: ToolRegistration[] = [];
  const server = {
    registerTool(
      name: string,
      config: ToolRegistration["config"],
      handler: ToolHandler,
    ) {
      registrations.push({ name, config, handler });
    },
  };
  registerTools(server as never, "contract-token-placeholder");
  return registrations;
}

const expectedCapabilityTools = {
  today: ["all_clear_summary"],
  search: ["search"],
  capture: ["list_captures", "capture_input"],
  calendar: ["calendar_read", "read_calendar_event", "create_calendar_event", "update_calendar_event"],
  tasks: ["list_tasks", "read_task", "create_task", "update_task", "complete_task"],
  areas: ["list_areas", "read_area", "read_area_aggregate", "create_area", "reparent_area", "update_area_state"],
  projects: ["list_projects", "read_project", "list_project_activity", "create_project", "update_project_state", "file_project", "log_project_activity"],
  ideas: ["list_ideas", "read_idea", "capture_idea", "update_idea", "add_idea_note"],
  references: ["list_references", "read_reference", "create_reference", "update_reference", "list_read_later", "save_read_later"],
  notesAndDocs: ["list_entity_notes", "read_entity_note", "add_entity_note", "update_entity_note", "list_entity_docs", "read_entity_doc", "create_entity_doc", "update_entity_doc"],
  milestones: ["list_milestones", "create_milestone", "update_milestone", "complete_milestone"],
  checkIns: ["list_check_ins", "create_check_in", "draft_check_in_summary"],
  journal: ["list_journal_entries", "create_journal_entry"],
  resurfacing: ["read_resurfaced_item", "respond_to_resurfaced_item"],
  reviews: ["list_scheduled_reviews", "settle_scheduled_review"],
  routines: ["list_routines", "list_routine_completions", "create_routine", "complete_routine"],
  people: ["list_people", "read_person", "create_person", "create_person_fact", "log_interaction"],
} as const;

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("MCP path segments preserve seeded IDs but reject route-confusable input", () => {
  assert.equal(apiPath("/areas", "seeded-area-id", "aggregate"), "/areas/seeded-area-id/aggregate");
  assert.equal(apiPath("/areas", "space allowed"), "/areas/space%20allowed");
  for (const unsafe of ["", ".", "..", "/", "?", "#", "\\", "abc/def", "abc?x", "abc#x"]) {
    assert.throws(() => apiPath("/areas", unsafe), /invalid.*path segment/i);
  }
});

test("Home Base MCP uses unique, active, non-destructive contracts for every capability group", () => {
  const tools = collectTools();
  const names = tools.map((tool) => tool.name);

  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(
    names.toSorted(),
    TOOL_CONTRACTS.map((contract) => contract.name).toSorted(),
    "the expected manifest must name every registered tool exactly once",
  );
  assert.equal(names.some((name) => /domain/i.test(name)), false);
  assert.equal(names.some((name) => /delete/i.test(name)), false);
  for (const tool of tools) {
    assert.ok(tool.config.description);
    assert.doesNotMatch(tool.config.description, /\bdomain(s)?\b/i);
  }
  for (const namesInGroup of Object.values(expectedCapabilityTools)) {
    for (const name of namesInGroup) assert.ok(names.includes(name), `missing ${name}`);
  }
  for (const contract of TOOL_CONTRACTS) {
    const pathname = contract.request.path.split("?", 1)[0];
    const pathInputIds = Object.entries(contract.input)
      .filter(([field, value]) =>
        field.endsWith("Id") &&
        typeof value === "string" &&
        pathname.includes(encodeURIComponent(value)))
      .map(([field]) => field)
      .toSorted();
    assert.deepEqual(
      (contract.pathIdFields ?? []).toSorted(),
      pathInputIds,
      `${contract.name} must declare every dynamic path ID for the route-confusion scan`,
    );
  }
});

test("capture_input exposes the persistence-only idempotent smoke contract", () => {
  const capture = collectTools().find((tool) => tool.name === "capture_input");
  assert.ok(capture?.config.inputSchema);
  assert.equal(capture.config.inputSchema.safeParse({
    rawText: "Preserve this",
    captureIntent: "preserve_only",
    idempotencyKey: "5b9f23d4-3e09-4f2f-8946-bdd621b4b5b2",
  }).success, true);
  assert.equal(capture.config.inputSchema.safeParse({
    rawText: "Do not expose model-selected intent",
    captureIntent: "task",
  }).success, false);
});

test("list_tasks exposes cursor pagination without adding another tool", () => {
  const listTasks = collectTools().find((tool) => tool.name === "list_tasks");
  assert.ok(listTasks?.config.inputSchema);
  assert.equal(listTasks.config.inputSchema.safeParse({ cursor: "task-100" }).success, true);
  assert.equal(listTasks.config.inputSchema.safeParse({ cursor: "" }).success, false);
});

test("every Home Base MCP tool matches its expected REST method, path, query, and body", async () => {
  const calls: Array<{ path: string; method: string; body?: unknown; authorization?: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({
      path: String(input).replace("http://127.0.0.1:3002/api/v1", ""),
      method: init?.method ?? "GET",
      ...(rawBody === undefined ? {} : { body: rawBody }),
      authorization: (init?.headers as Record<string, string>).Authorization,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const tools = collectTools();
  const byName = new Map(tools.map((tool) => [tool.name, tool.handler]));

  for (const contract of TOOL_CONTRACTS) {
    const handler = byName.get(contract.name);
    assert.ok(handler, `missing handler for ${contract.name}`);
    const before = calls.length;
    await handler(contract.input);
    assert.equal(calls.length, before + 1, `${contract.name} must make exactly one REST call`);
    assert.deepEqual(calls.at(-1), {
      ...contract.request,
      authorization: "Bearer contract-token-placeholder",
    }, contract.name);
  }
});

test("every dynamic MCP ID handler rejects route-confusable segments before fetch", async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  const byName = new Map(collectTools().map((tool) => [tool.name, tool.handler]));
  const unsafeSegments = ["", ".", "..", "/", "?", "#", "\\", "abc/def", "abc?x", "abc#x"];

  for (const contract of TOOL_CONTRACTS.filter((entry) => entry.pathIdFields?.length)) {
    const handler = byName.get(contract.name);
    assert.ok(handler, `missing handler for ${contract.name}`);
    for (const field of contract.pathIdFields ?? []) {
      for (const unsafe of unsafeSegments) {
        const before = fetchCalls;
        let rejected = false;
        try {
          await handler({ ...contract.input, [field]: unsafe });
        } catch {
          rejected = true;
        }
        assert.equal(
          rejected,
          true,
          `${contract.name}.${field} accepted ${JSON.stringify(unsafe)}`,
        );
        assert.equal(fetchCalls, before, `${contract.name}.${field} fetched before rejecting`);
      }
    }
  }
});

test("Home Base MCP returns structured errors without upstream response details", async () => {
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ error: "private implementation detail" }),
    { status: 500, statusText: "Internal Server Error" },
  )) as typeof fetch;
  const readTask = collectTools().find((tool) => tool.name === "read_task")?.handler;

  const result = await readTask?.({ taskId: "task-1" });

  assert.equal((result as { isError?: boolean }).isError, true);
  const serialized = JSON.stringify(result);
  assert.match(serialized, /home_base_api_error/);
  assert.match(serialized, /500/);
  assert.doesNotMatch(serialized, /private implementation detail/);
});

test("Home Base MCP returns structured errors when REST is unavailable", async () => {
  globalThis.fetch = (async () => {
    throw new Error("connection detail");
  }) as typeof fetch;
  const readTask = collectTools().find((tool) => tool.name === "read_task")?.handler;

  const result = await readTask?.({ taskId: "task-1" });

  assert.equal((result as { isError?: boolean }).isError, true);
  const serialized = JSON.stringify(result);
  assert.match(serialized, /home_base_api_error/);
  assert.match(serialized, /502/);
  assert.doesNotMatch(serialized, /connection detail/);
});

test("Home Base MCP redacts response body read failures", async () => {
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => {
      throw new Error("body stream detail");
    },
  })) as unknown as typeof fetch;
  const readTask = collectTools().find((tool) => tool.name === "read_task")?.handler;

  const result = await readTask?.({ taskId: "task-1" });

  assert.equal((result as { isError?: boolean }).isError, true);
  const serialized = JSON.stringify(result);
  assert.match(serialized, /home_base_api_error/);
  assert.doesNotMatch(serialized, /body stream detail/);
});

test("Home Base MCP treats malformed successful JSON as a structured error", async () => {
  globalThis.fetch = (async () => new Response("{malformed", { status: 200 })) as typeof fetch;
  const readTask = collectTools().find((tool) => tool.name === "read_task")?.handler;

  const result = await readTask?.({ taskId: "task-1" });

  assert.equal((result as { isError?: boolean }).isError, true);
  assert.match(JSON.stringify(result), /home_base_api_error/);
});

test("Home Base MCP treats an empty successful response as malformed JSON", async () => {
  globalThis.fetch = (async () => new Response("", { status: 200 })) as typeof fetch;
  const readTask = collectTools().find((tool) => tool.name === "read_task")?.handler;

  const result = await readTask?.({ taskId: "task-1" });

  assert.equal((result as { isError?: boolean }).isError, true);
  assert.match(JSON.stringify(result), /home_base_api_error/);
});
