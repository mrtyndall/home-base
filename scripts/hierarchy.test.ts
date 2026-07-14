import assert from "node:assert/strict";
import test from "node:test";

import {
  updateAreaWithValidatedParent,
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

test("assertValidAreaParent requires a non-empty Area ID", async () => {
  await assert.rejects(
    assertValidAreaParent("", null, parentClient([])),
    (error: unknown) => (error as { code?: string }).code === "invalid_area_id",
  );
});

test("assertValidAreaParent normalizes an empty optional parent to null", async () => {
  const calls: string[] = [];
  await assertValidAreaParent("area-1", "  ", {
    area: {
      findUnique: async () => {
        calls.push("query");
        return null;
      },
    },
  });
  assert.deepEqual(calls, []);
});

test("updateAreaWithValidatedParent locks the hierarchy before validation and update", async () => {
  const calls: string[] = [];
  const rows = new Map([
    ["child", { id: "child", parentAreaId: null as string | null }],
    ["parent", { id: "parent", parentAreaId: null as string | null }],
  ]);
  const client = {
    $queryRawUnsafe: async (query: string, namespace: number, key: number) => {
      calls.push(`lock:${query}:${namespace}:${key}`);
      return [{ pg_advisory_xact_lock: null }];
    },
    area: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        calls.push(`find:${where.id}`);
        return rows.get(where.id) ?? null;
      },
      update: async ({ where, data }: {
        where: { id: string };
        data: { parentAreaId: string | null; name?: string };
      }) => {
        calls.push(`update:${where.id}:${data.parentAreaId}:${data.name}`);
        return { ...rows.get(where.id)!, ...data };
      },
    },
  };

  const updated = await updateAreaWithValidatedParent(
    "child",
    "parent",
    () => client.area.update({
      where: { id: "child" },
      data: { parentAreaId: "parent", name: "Renamed" },
    }),
    client as never,
  );

  assert.equal(updated.parentAreaId, "parent");
  assert.match(calls[0], /^lock:SELECT .*pg_advisory_xact_lock/);
  assert.deepEqual(calls.slice(1), ["find:parent", "update:child:parent:Renamed"]);
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
