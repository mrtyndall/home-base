import { type Project } from "@prisma/client";
import { prisma } from "@/lib/db";

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
  | "parent_not_found"
  | "area_not_found"
  | "invalid_area_id";

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

export type ProjectMutationValidationCode =
  | "area_not_found"
  | "conflicting_area_fields"
  | "project_not_found";

export class ProjectMutationValidationError extends Error {
  constructor(public readonly code: ProjectMutationValidationCode) {
    super(
      code === "area_not_found"
        ? "Area not found."
        : code === "project_not_found"
          ? "Project not found."
          : "Conflicting Area fields.",
    );
    this.name = "ProjectMutationValidationError";
  }
}

export type ProjectMutationInput = {
  areaId?: string | null;
  areaName?: string;
  name?: string;
  status?: Project["status"];
  currentState?: string | null;
  nextStep?: string | null;
  targetDate?: Date | null;
  parkedAt?: Date | null;
  completedAt?: Date | null;
  killedAt?: Date | null;
  activity: { entry: string; source: string };
  notification: {
    title: string;
    source: "manual" | "api";
    actor?: string;
  };
};

export async function mutateProject(
  projectId: string,
  input: ProjectMutationInput,
  client: typeof prisma = prisma,
): Promise<Project> {
  return client.$transaction(async (transaction) => {
    const existing = await transaction.project.findUnique({
      where: { id: projectId },
    });
    if (!existing) {
      throw new ProjectMutationValidationError("project_not_found");
    }

    const hasAreaInput = input.areaId !== undefined || input.areaName !== undefined;
    const areaId = hasAreaInput
      ? await resolveEligibleProjectAreaReference(
          input.areaId,
          input.areaName,
          transaction,
        )
      : existing.areaId;

    const project = await transaction.project.update({
      where: { id: projectId },
      data: {
        ...(hasAreaInput ? { areaId } : {}),
        name: input.name,
        status: input.status,
        currentState: input.currentState,
        nextStep: input.nextStep,
        targetDate: input.targetDate,
        parkedAt: input.parkedAt,
        completedAt: input.completedAt,
        killedAt: input.killedAt,
      },
    });

    if (hasAreaInput) {
      const children = { where: { projectId }, data: { areaId } };
      await transaction.task.updateMany(children);
      await transaction.idea.updateMany(children);
      await transaction.reference.updateMany(children);
    }

    await transaction.projectActivity.create({
      data: {
        projectId,
        entry: input.activity.entry,
        source: input.activity.source,
        stateSnapshot: {
          status: project.status,
          current_state: project.currentState,
          next_step: project.nextStep,
          area_id: project.areaId,
        },
      },
    });

    await transaction.notification.create({
      data: {
        type: "project_updated",
        title: input.notification.title,
        body: project.name,
        sourceRef: {
          type: "project",
          id: project.id,
          source: input.notification.source,
          ...(input.notification.actor ? { actor: input.notification.actor } : {}),
        },
      },
    });

    return project;
  });
}

export async function resolveEligibleProjectAreaReference(
  areaId: string | null | undefined,
  areaName: string | undefined,
  client: { area: Pick<typeof prisma.area, "findFirst"> },
): Promise<string | null> {
  const normalizedAreaId = areaId?.trim() || null;
  const normalizedAreaName = areaName?.trim() || undefined;
  if (!normalizedAreaId && !normalizedAreaName) return null;

  const area = await client.area.findFirst({
    where: normalizedAreaName
      ? {
          name: { equals: normalizedAreaName, mode: "insensitive" },
          status: "active",
          isSystem: false,
        }
      : { id: normalizedAreaId!, status: "active", isSystem: false },
    select: { id: true },
  });
  if (!area) throw new ProjectMutationValidationError("area_not_found");
  if (normalizedAreaId && area.id !== normalizedAreaId) {
    throw new ProjectMutationValidationError("conflicting_area_fields");
  }
  return area.id;
}

export async function fileProject(
  projectId: string,
  areaId: string | null,
  client: typeof prisma = prisma,
): Promise<Project> {
  return mutateProject(
    projectId,
    {
      areaId,
      activity: {
        entry: areaId === null ? "Project unfiled." : "Project filed to Area.",
        source: "manual",
      },
      notification: {
        title: areaId === null ? "Project unfiled" : "Project filed",
        source: "manual",
      },
    },
    client,
  );
}

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
  const normalizedAreaId = areaId.trim();
  const normalizedParentAreaId = parentAreaId?.trim() || null;
  if (!normalizedAreaId) {
    throw new HierarchyValidationError("invalid_area_id");
  }
  if (normalizedParentAreaId === null) return;
  if (normalizedParentAreaId === normalizedAreaId) {
    throw new HierarchyValidationError("self_parent");
  }

  const visited = new Set<string>();
  let ancestorId: string | null = normalizedParentAreaId;

  while (ancestorId !== null) {
    if (ancestorId === normalizedAreaId || visited.has(ancestorId)) {
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
