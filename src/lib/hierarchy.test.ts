import { describe, expect, it, vi } from "vitest";

import {
  HierarchyValidationError,
  assertValidAreaParent,
  buildAreaTree,
  flattenAreaOptions,
} from "./hierarchy";

const areas = [
  { id: "radio", name: "Ham Radio", parentAreaId: "hobbies", sortOrder: 2 },
  { id: "hobbies", name: "Hobbies", parentAreaId: null, sortOrder: 2 },
  { id: "antennas", name: "Antennas", parentAreaId: "radio", sortOrder: 1 },
  { id: "home", name: "Home", parentAreaId: null, sortOrder: 1 },
  { id: "garden", name: "Garden", parentAreaId: "hobbies", sortOrder: 1 },
];

describe("buildAreaTree", () => {
  it("orders roots, children, and grandchildren by sort order", () => {
    const tree = buildAreaTree(areas);

    expect(tree.map((area) => area.id)).toEqual(["home", "hobbies"]);
    expect(tree[1].children.map((area) => area.id)).toEqual(["garden", "radio"]);
    expect(tree[1].children[1].children.map((area) => area.id)).toEqual([
      "antennas",
    ]);
  });
});

describe("flattenAreaOptions", () => {
  it("builds slash-separated paths for nested areas", () => {
    const options = flattenAreaOptions(areas);

    expect(options.find((option) => option.id === "radio")?.path).toBe(
      "Hobbies / Ham Radio",
    );
    expect(options.find((option) => option.id === "antennas")?.path).toBe(
      "Hobbies / Ham Radio / Antennas",
    );
  });

  it("keeps an area whose parent is absent", () => {
    const options = flattenAreaOptions([
      ...areas,
      { id: "orphan", name: "Orphan", parentAreaId: "missing", sortOrder: 3 },
    ]);

    expect(options.find((option) => option.id === "orphan")).toMatchObject({
      path: "Orphan",
      depth: 0,
    });
  });
});

describe("assertValidAreaParent", () => {
  it("rejects assigning an area as its own parent", async () => {
    const client = parentClient([]);

    await expect(assertValidAreaParent("hobbies", "hobbies", client)).rejects.toMatchObject({
      name: "HierarchyValidationError",
      code: "self_parent",
    });
    expect(client.area.findUnique).not.toHaveBeenCalled();
  });

  it("rejects assigning a descendant as an area's parent", async () => {
    const client = parentClient([
      { id: "antennas", parentAreaId: "radio" },
      { id: "radio", parentAreaId: "hobbies" },
    ]);

    await expect(
      assertValidAreaParent("hobbies", "antennas", client),
    ).rejects.toEqual(
      expect.objectContaining<Partial<HierarchyValidationError>>({ code: "cycle" }),
    );
  });

  it("rejects an unknown proposed parent", async () => {
    const client = parentClient([]);

    await expect(
      assertValidAreaParent("hobbies", "missing", client),
    ).rejects.toMatchObject({ code: "parent_not_found" });
  });
});

function parentClient(rows: Array<{ id: string; parentAreaId: string | null }>) {
  const byId = new Map(rows.map((row) => [row.id, row]));

  return {
    area: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        byId.get(where.id) ?? null,
      ),
    },
  };
}
