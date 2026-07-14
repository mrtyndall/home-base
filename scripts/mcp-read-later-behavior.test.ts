import assert from "node:assert/strict";
import test from "node:test";

import { readLaterMcpSchemas, readLaterProxyRequest } from "../mcp/read-later-tools";

test("MCP Read Later schemas reject destructive status and invalid URLs", () => {
  assert.throws(() => readLaterMcpSchemas.save.parse({ url: "ftp://example.com/file" }));
  assert.throws(() => readLaterMcpSchemas.status.parse({ referenceId: "read-1", status: "deleted" }));
  assert.deepEqual(readLaterMcpSchemas.status.parse({ referenceId: "read-1", status: "archived" }), {
    referenceId: "read-1", status: "archived",
  });
});

test("MCP tools forward exact payloads to bearer-authenticated REST", () => {
  assert.deepEqual(readLaterProxyRequest("list_read_later", { status: "unread", limit: 20 }), {
    path: "/read-later?status=unread&limit=20", method: "GET",
  });
  assert.deepEqual(readLaterProxyRequest("save_read_later", {
    url: "https://example.com", title: "Example", projectId: "project-1",
  }), {
    path: "/read-later", method: "POST",
    body: { url: "https://example.com", title: "Example", projectId: "project-1" },
  });
  assert.deepEqual(readLaterProxyRequest("file_reference", {
    referenceId: "read-1", areaId: null, projectId: null,
  }), {
    path: "/references/read-1/file", method: "POST", body: { areaId: null, projectId: null },
  });
  assert.deepEqual(readLaterProxyRequest("set_read_later_status", {
    referenceId: "read-1", status: "read",
  }), {
    path: "/read-later/read-1/status", method: "POST", body: { status: "read" },
  });
});
