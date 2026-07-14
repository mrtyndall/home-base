import assert from "node:assert/strict";
import { destinationKind, normalizeDestination } from "../src/lib/destinations";

assert.equal(destinationKind({}), "inbox");
assert.deepEqual(normalizeDestination({ areaId: " area-1 ", projectId: "" }), {
  areaId: "area-1",
  projectId: null,
});
assert.equal(destinationKind({ areaId: "area-1" }), "area");
assert.equal(destinationKind({ areaId: "area-1", projectId: "project-1" }), "project");
assert.throws(
  () => normalizeDestination({ projectId: "project-1" }),
  /Project destinations require an Area/,
);
