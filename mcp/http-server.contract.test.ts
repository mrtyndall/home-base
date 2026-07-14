import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { registerTools } from "./http-server";

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;
type ToolRegistration = {
  name: string;
  config: { description?: string };
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
  areas: ["list_areas", "read_area", "create_area", "reparent_area", "update_area_state"],
  projects: ["list_projects", "read_project", "create_project", "update_project_state", "file_project", "log_project_activity"],
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

test("Home Base MCP uses unique, active, non-destructive contracts for every capability group", () => {
  const tools = collectTools();
  const names = tools.map((tool) => tool.name);

  assert.equal(tools.length, 72);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.some((name) => /domain/i.test(name)), false);
  assert.equal(names.some((name) => /delete/i.test(name)), false);
  for (const tool of tools) {
    assert.ok(tool.config.description);
    assert.doesNotMatch(tool.config.description, /\bdomain(s)?\b/i);
  }
  for (const namesInGroup of Object.values(expectedCapabilityTools)) {
    for (const name of namesInGroup) assert.ok(names.includes(name), `missing ${name}`);
  }
});

test("Home Base MCP proxies read, write, and capture tools to scoped REST routes", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const tools = collectTools();
  const byName = new Map(tools.map((tool) => [tool.name, tool.handler]));

  await byName.get("read_task")?.({ taskId: "task-1" });
  await byName.get("update_task")?.({ taskId: "task-1", title: "Next" });
  await byName.get("capture_input")?.({ rawText: "Remember this" });

  assert.equal(calls[0]?.input, "http://127.0.0.1:3002/api/v1/tasks/task-1");
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal((calls[0]?.init?.headers as Record<string, string>).Authorization, "Bearer contract-token-placeholder");
  assert.equal(calls[1]?.input, "http://127.0.0.1:3002/api/v1/tasks/task-1");
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.equal(calls[1]?.init?.body, JSON.stringify({ title: "Next" }));
  assert.equal(calls[2]?.input, "http://127.0.0.1:3002/api/v1/captures");
  assert.equal(calls[2]?.init?.method, "POST");
  assert.equal(calls[2]?.init?.body, JSON.stringify({ rawText: "Remember this" }));
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
