import { type Project } from "@prisma/client";
import { prisma } from "@/lib/db";
export { buildAreaTree, flattenAreaOptions } from "@/lib/area-options";
export type { AreaHierarchyRecord, AreaOption, AreaTreeNode } from "@/lib/area-options";

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
