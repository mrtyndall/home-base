export type AreaHierarchyRecord = {
  id: string;
  name: string;
  parentAreaId: string | null;
  sortOrder: number;
};

export type AreaTreeNode = AreaHierarchyRecord & {
  children: AreaTreeNode[];
};

export type AreaOption = {
  id: string;
  name: string;
  path: string;
  depth: number;
};

export type HierarchyValidationCode =
  | "self_parent"
  | "cycle"
  | "parent_not_found";

export class HierarchyValidationError extends Error {
  constructor(public readonly code: HierarchyValidationCode) {
    super(code);
    this.name = "HierarchyValidationError";
  }
}

type AreaParentClient = {
  area: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; parentAreaId: true };
    }): Promise<{ id: string; parentAreaId: string | null } | null>;
  };
};

export function buildAreaTree(
  areas: readonly AreaHierarchyRecord[],
): AreaTreeNode[] {
  const nodes = new Map<string, AreaTreeNode>();

  for (const area of areas) {
    nodes.set(area.id, { ...area, children: [] });
  }

  const roots: AreaTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentAreaId ? nodes.get(node.parentAreaId) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const node of nodes.values()) {
    node.children.sort(compareAreas);
  }

  return roots.sort(compareAreas);
}

export function flattenAreaOptions(
  areas: readonly AreaHierarchyRecord[],
): AreaOption[] {
  const options: AreaOption[] = [];
  const stack = buildAreaTree(areas)
    .slice()
    .reverse()
    .map((node) => ({ node, parentPath: "", depth: 0 }));

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;

    const path = current.parentPath
      ? `${current.parentPath} / ${current.node.name}`
      : current.node.name;
    options.push({
      id: current.node.id,
      name: current.node.name,
      path,
      depth: current.depth,
    });

    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      stack.push({
        node: current.node.children[index],
        parentPath: path,
        depth: current.depth + 1,
      });
    }
  }

  return options;
}

export async function assertValidAreaParent(
  areaId: string,
  parentAreaId: string | null,
  client: AreaParentClient,
): Promise<void> {
  if (parentAreaId === null) return;
  if (parentAreaId === areaId) {
    throw new HierarchyValidationError("self_parent");
  }

  const visited = new Set<string>();
  let ancestorId: string | null = parentAreaId;

  while (ancestorId !== null) {
    if (ancestorId === areaId || visited.has(ancestorId)) {
      throw new HierarchyValidationError("cycle");
    }
    visited.add(ancestorId);

    const ancestor = await client.area.findUnique({
      where: { id: ancestorId },
      select: { id: true, parentAreaId: true },
    });
    if (!ancestor) {
      throw new HierarchyValidationError("parent_not_found");
    }
    ancestorId = ancestor.parentAreaId;
  }
}

function compareAreas(left: AreaHierarchyRecord, right: AreaHierarchyRecord) {
  return (
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}
