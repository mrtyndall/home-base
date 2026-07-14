import assert from "node:assert/strict";
import test from "node:test";

import { readLaterMcpSchemas, readLaterProxyRequest } from "../mcp/read-later-tools";
import { registerReadLaterTools } from "../mcp/read-later-registration";

const READ_ID = "11111111-1111-4111-8111-111111111111";
const AREA_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

test("MCP Read Later schemas reject destructive status and invalid URLs", () => {
  assert.throws(() => readLaterMcpSchemas.save.parse({ url: "ftp://example.com/file" }));
  assert.throws(() => readLaterMcpSchemas.status.parse({ referenceId: READ_ID, status: "deleted" }));
  assert.throws(() => readLaterMcpSchemas.status.parse({ referenceId: "../unsafe", status: "read" }));
  assert.deepEqual(readLaterMcpSchemas.status.parse({ referenceId: READ_ID, status: "archived" }), {
    referenceId: READ_ID, status: "archived",
  });
});

test("MCP tools forward exact payloads to bearer-authenticated REST", () => {
  assert.deepEqual(readLaterProxyRequest("list_read_later", {
    status: "unread", limit: 20, cursor: READ_ID,
  }), {
    path: `/read-later?status=unread&limit=20&cursor=${READ_ID}`, method: "GET",
  });
  assert.deepEqual(readLaterProxyRequest("save_read_later", {
    url: "https://example.com", title: "Example", projectId: PROJECT_ID,
  }), {
    path: "/read-later", method: "POST",
    body: { url: "https://example.com", title: "Example", projectId: PROJECT_ID },
  });
  assert.deepEqual(readLaterProxyRequest("file_reference", {
    referenceId: READ_ID, areaId: null, projectId: null,
  }), {
    path: `/references/${READ_ID}/file`, method: "POST", body: { areaId: null, projectId: null },
  });
  assert.deepEqual(readLaterProxyRequest("set_read_later_status", {
    referenceId: READ_ID, status: "read",
  }), {
    path: `/read-later/${READ_ID}/status`, method: "POST", body: { status: "read" },
  });
});

test("actual MCP registration forwards bearer-authenticated payloads", async () => {
  const handlers = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
  const server = {
    registerTool(name: string, _config: unknown, handler: (input: Record<string, unknown>) => Promise<unknown>) {
      handlers.set(name, handler);
    },
  };
  const calls: Array<Record<string, unknown>> = [];
  registerReadLaterTools(server as never, "bearer-placeholder", async (bearer, path, method, body) => {
    calls.push({ bearer, path, method, body });
    return { ok: true };
  });
  assert.deepEqual([...handlers.keys()], [
    "list_read_later", "save_read_later", "file_reference", "set_read_later_status",
  ]);
  await handlers.get("list_read_later")?.({ status: "read", cursor: READ_ID });
  await handlers.get("save_read_later")?.({ url: "https://example.com", areaId: AREA_ID });
  await handlers.get("file_reference")?.({ referenceId: READ_ID, projectId: PROJECT_ID });
  await handlers.get("set_read_later_status")?.({ referenceId: READ_ID, status: "archived" });
  assert.deepEqual(calls, [
    { bearer: "bearer-placeholder", path: `/read-later?status=read&cursor=${READ_ID}`, method: "GET", body: undefined },
    { bearer: "bearer-placeholder", path: "/read-later", method: "POST", body: { url: "https://example.com", areaId: AREA_ID } },
    { bearer: "bearer-placeholder", path: `/references/${READ_ID}/file`, method: "POST", body: { projectId: PROJECT_ID } },
    { bearer: "bearer-placeholder", path: `/read-later/${READ_ID}/status`, method: "POST", body: { status: "archived" } },
  ]);
});

test("actual MCP registration propagates stable REST errors", async () => {
  const handlers = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
  const server = {
    registerTool(name: string, _config: unknown, handler: (input: Record<string, unknown>) => Promise<unknown>) {
      handlers.set(name, handler);
    },
  };
  registerReadLaterTools(server as never, "bearer-placeholder", async () => {
    throw new Error('{"error":{"code":"invalid_read_later_cursor","message":"Read Later cursor not found."}}');
  });
  const list = handlers.get("list_read_later");
  assert.ok(list);
  await assert.rejects(
    list({ cursor: READ_ID }),
    /invalid_read_later_cursor/,
  );
});
