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

export function buildAreaTree(
  areas: readonly AreaHierarchyRecord[],
): AreaTreeNode[] {
  const nodes = new Map<string, AreaTreeNode>();
  for (const area of areas) nodes.set(area.id, { ...area, children: [] });

  const roots: AreaTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentAreaId ? nodes.get(node.parentAreaId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  for (const node of nodes.values()) node.children.sort(compareAreas);
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
    options.push({ id: current.node.id, name: current.node.name, path, depth: current.depth });
    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: current.node.children[index], parentPath: path, depth: current.depth + 1 });
    }
  }
  return options;
}

function compareAreas(left: AreaHierarchyRecord, right: AreaHierarchyRecord) {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}
