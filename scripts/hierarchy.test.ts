import assert from "node:assert/strict";
import test from "node:test";

import {
  assertValidAreaParent,
  buildAreaTree,
  flattenAreaOptions,
} from "../src/lib/hierarchy";

const areas = [
  { id: "radio", name: "Ham Radio", parentAreaId: "hobbies", sortOrder: 2 },
  { id: "hobbies", name: "Hobbies", parentAreaId: null, sortOrder: 2 },
  { id: "antennas", name: "Antennas", parentAreaId: "radio", sortOrder: 1 },
  { id: "home", name: "Home", parentAreaId: null, sortOrder: 1 },
  { id: "garden", name: "Garden", parentAreaId: "hobbies", sortOrder: 1 },
];

test("buildAreaTree orders roots, children, and grandchildren", () => {
  const tree = buildAreaTree(areas);

  assert.deepEqual(tree.map((area) => area.id), ["home", "hobbies"]);
  assert.deepEqual(tree[1].children.map((area) => area.id), ["garden", "radio"]);
  assert.deepEqual(tree[1].children[1].children.map((area) => area.id), ["antennas"]);
});

test("flattenAreaOptions builds slash-separated nested paths", () => {
  const options = flattenAreaOptions(areas);

  assert.equal(
    options.find((option) => option.id === "radio")?.path,
    "Hobbies / Ham Radio",
  );
  assert.equal(
    options.find((option) => option.id === "antennas")?.path,
    "Hobbies / Ham Radio / Antennas",
  );
});

test("flattenAreaOptions keeps an Area whose parent is absent", () => {
  const options = flattenAreaOptions([
    ...areas,
    { id: "orphan", name: "Orphan", parentAreaId: "missing", sortOrder: 3 },
  ]);

  assert.deepEqual(
    options.find((option) => option.id === "orphan"),
    { id: "orphan", name: "Orphan", path: "Orphan", depth: 0 },
  );
});

test("assertValidAreaParent rejects an Area as its own parent", async () => {
  const client = parentClient([]);

  await assert.rejects(
    assertValidAreaParent("hobbies", "hobbies", client),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "HierarchyValidationError" &&
      "code" in error &&
      error.code === "self_parent",
  );
  assert.equal(client.findCount(), 0);
});

test("assertValidAreaParent rejects a descendant parent", async () => {
  const client = parentClient([
    { id: "antennas", parentAreaId: "radio" },
    { id: "radio", parentAreaId: "hobbies" },
  ]);

  await assert.rejects(
    assertValidAreaParent("hobbies", "antennas", client),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "cycle",
  );
});

test("assertValidAreaParent rejects an unknown proposed parent", async () => {
  const client = parentClient([]);

  await assert.rejects(
    assertValidAreaParent("hobbies", "missing", client),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "parent_not_found",
  );
});

function parentClient(rows: Array<{ id: string; parentAreaId: string | null }>) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let count = 0;

  return {
    area: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        count += 1;
        return byId.get(where.id) ?? null;
      },
    },
    findCount: () => count,
  };
}
