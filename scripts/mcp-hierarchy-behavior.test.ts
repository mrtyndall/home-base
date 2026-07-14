import assert from "node:assert/strict";
import test from "node:test";
import {
  hierarchyMcpSchemas,
  hierarchyProxyRequest,
} from "../mcp/hierarchy-tools";

test("MCP hierarchy schemas normalize optional empty parents and reject empty IDs", () => {
  assert.deepEqual(hierarchyMcpSchemas.createArea.parse({ name: "Radio", parentAreaId: "" }), {
    name: "Radio", parentAreaId: null,
  });
  assert.throws(() => hierarchyMcpSchemas.reparentArea.parse({ areaId: "", parentAreaId: null }));
  assert.throws(() => hierarchyMcpSchemas.fileProject.parse({ projectId: "", areaId: null }));
});

test("MCP reparent and file tools produce thin REST proxy requests", () => {
  assert.deepEqual(
    hierarchyProxyRequest("reparent_area", { areaId: "area-1", parentAreaId: "parent-1" }),
    { path: "/areas/area-1", method: "PATCH", body: { parentAreaId: "parent-1" } },
  );
  assert.deepEqual(
    hierarchyProxyRequest("file_project", { projectId: "project-1", areaId: null }),
    { path: "/projects/project-1", method: "PATCH", body: { areaId: null } },
  );
});
