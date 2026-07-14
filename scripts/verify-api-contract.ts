import assert from "node:assert/strict";
import { HierarchyValidationError } from "../src/lib/hierarchy";
import { toHierarchyApiError } from "../src/lib/api/hierarchy";
import {
  hierarchyMcpSchemas,
  hierarchyProxyRequest,
} from "../mcp/hierarchy-tools";

async function main() {
  const cycle = toHierarchyApiError(new HierarchyValidationError("cycle"));
  assert.equal(cycle?.status, 400);
  assert.deepEqual(await cycle?.json(), {
    error: { code: "cycle", message: "That parent would create an Area cycle." },
  });

  assert.deepEqual(
    hierarchyMcpSchemas.createArea.parse({ name: "Radio", parentAreaId: "" }),
    { name: "Radio", parentAreaId: null },
  );
  assert.deepEqual(
    hierarchyProxyRequest("file_project", { projectId: "project-1", areaId: null }),
    { path: "/projects/project-1", method: "PATCH", body: { areaId: null } },
  );

  console.log("API hierarchy behavior contract verified.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "API contract verification failed.");
  process.exitCode = 1;
});
