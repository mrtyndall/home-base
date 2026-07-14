import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  assertValidAreaParent,
  flattenAreaOptions,
  HierarchyValidationError,
  mutateProject,
  ProjectMutationValidationError,
  resolveEligibleProjectAreaReference,
} from "@/lib/hierarchy";

export type ApiHierarchyActor = { label: string };

export type ApiProjectInput = {
  name: string;
  areaId?: string | null;
  areaName?: string;
  status?: "someday" | "active" | "parked" | "completed" | "killed";
  currentState?: string;
  nextStep?: string;
  targetDate?: string;
};

export type ApiProjectPatch = Partial<ApiProjectInput> & { logEntry?: string };

export type ApiAreaInput = {
  name: string;
  parentAreaId?: string | null;
  status?: "active" | "parked" | "retired";
  currentState?: string;
  nextStep?: string;
  tendingCadence?: string;
  sortOrder?: number;
};

export async function createProjectForApi(
  input: ApiProjectInput,
  actor: ApiHierarchyActor,
  client: typeof prisma = prisma,
) {
  return client.$transaction(async (transaction) => {
    const areaId = await resolveEligibleProjectAreaReference(
      input.areaId,
      input.areaName,
      transaction,
    );
    const now = new Date();
    const status = input.status ?? "active";
    const project = await transaction.project.create({
      data: {
        name: input.name,
        areaId,
        status,
        targetDate: parseDateOnly(input.targetDate),
        parkedAt: status === "parked" ? now : undefined,
        completedAt: status === "completed" ? now : undefined,
        killedAt: status === "killed" ? now : undefined,
        currentState: input.currentState,
        nextStep: input.nextStep,
      },
    });
    await transaction.projectActivity.create({
      data: {
        projectId: project.id,
        entry: "Project created through API.",
        source: `api:${actor.label}`,
        stateSnapshot: {
          current_state: project.currentState,
          next_step: project.nextStep,
          status: project.status,
          area_id: project.areaId,
        },
      },
    });
    await transaction.notification.create({
      data: {
        type: "project_created",
        title: "Project created",
        body: project.name,
        sourceRef: {
          type: "project",
          id: project.id,
          source: "api",
          actor: actor.label,
        },
      },
    });
    return project;
  });
}

export async function patchProjectForApi(
  projectId: string,
  input: ApiProjectPatch,
  actor: ApiHierarchyActor,
  client: typeof prisma = prisma,
) {
  const now = new Date();
  return mutateProject(
    projectId,
    {
      areaId: input.areaId,
      areaName: input.areaName,
      name: input.name,
      status: input.status,
      currentState: input.currentState,
      nextStep: input.nextStep,
      targetDate: parseDateOnly(input.targetDate),
      parkedAt:
        input.status === "parked"
          ? now
          : input.status === "active" || input.status === "someday"
            ? null
            : undefined,
      completedAt: input.status === "completed" ? now : undefined,
      killedAt: input.status === "killed" ? now : undefined,
      activity: {
        entry: input.logEntry ?? `Project updated through API by ${actor.label}.`,
        source: `api:${actor.label}`,
      },
      notification: {
        title: "Project updated",
        source: "api",
        actor: actor.label,
      },
    },
    client,
  );
}

export async function createAreaForApi(
  input: ApiAreaInput,
  actor: ApiHierarchyActor,
  client: typeof prisma = prisma,
) {
  return client.$transaction(async (transaction) => {
    const id = randomUUID();
    const parentAreaId = input.parentAreaId?.trim() || null;
    await assertValidAreaParent(id, parentAreaId, transaction);
    const area = await transaction.area.create({
      data: {
        id,
        name: input.name,
        parentAreaId,
        status: input.status ?? "active",
        currentState: input.currentState,
        nextStep: input.nextStep,
        tendingCadence: input.tendingCadence,
        sortOrder: input.sortOrder,
      },
    });
    await transaction.notification.create({
      data: {
        type: "area_created",
        title: "Area created",
        sourceRef: { type: "area", id: area.id, source: "api", actor: actor.label },
      },
    });
    return area;
  });
}

export async function patchAreaForApi(
  areaId: string,
  input: Partial<ApiAreaInput>,
  actor: ApiHierarchyActor,
  client: typeof prisma = prisma,
) {
  return client.$transaction(async (transaction) => {
    const existing = await transaction.area.findUnique({
      where: { id: areaId },
      select: { id: true, parentAreaId: true },
    });
    if (!existing) throw new HierarchyValidationError("area_not_found");

    const parentAreaId = input.parentAreaId === undefined
      ? undefined
      : input.parentAreaId?.trim() || null;
    if (parentAreaId !== undefined) {
      await assertValidAreaParent(areaId, parentAreaId, transaction);
    }
    const area = await transaction.area.update({
      where: { id: areaId },
      data: {
        name: input.name,
        parentAreaId,
        status: input.status,
        currentState: input.currentState,
        nextStep: input.nextStep,
        tendingCadence: input.tendingCadence,
        sortOrder: input.sortOrder,
      },
    });
    await transaction.notification.create({
      data: {
        type: "area_updated",
        title: "Area updated",
        sourceRef: { type: "area", id: area.id, source: "api", actor: actor.label },
      },
    });
    return area;
  });
}

export async function listAreasForApi(
  client: typeof prisma = prisma,
  limit = 100,
) {
  const hierarchy = await client.area.findMany({
    select: { id: true, name: true, parentAreaId: true, sortOrder: true },
  });
  const options = flattenAreaOptions(hierarchy).slice(0, limit);
  if (options.length === 0) return [];
  const areas = await client.area.findMany({
    where: { id: { in: options.map((option) => option.id) } },
  });
  const byId = new Map(areas.map((area) => [area.id, area]));
  return options.flatMap((option) => {
    const area = byId.get(option.id);
    return area ? [{ ...area, path: option.path }] : [];
  });
}

export function toHierarchyApiError(error: unknown) {
  if (error instanceof HierarchyValidationError) {
    const status = error.code === "area_not_found" ? 404 : 400;
    return Response.json(
      { error: { code: error.code, message: hierarchyMessage(error.code) } },
      { status },
    );
  }
  if (error instanceof ProjectMutationValidationError) {
    const status = error.code === "project_not_found" ? 404 : 400;
    return Response.json(
      { error: { code: error.code, message: projectMessage(error.code) } },
      { status },
    );
  }
  return null;
}

export function toApiErrorResponse(error: unknown) {
  return toHierarchyApiError(error) ?? Response.json(
    { error: "API request failed." },
    { status: 500 },
  );
}

function hierarchyMessage(code: HierarchyValidationError["code"]) {
  switch (code) {
    case "self_parent": return "An Area cannot be its own parent.";
    case "cycle": return "That parent would create an Area cycle.";
    case "parent_not_found": return "Parent Area not found.";
    case "area_not_found": return "Area not found.";
    case "invalid_area_id": return "Area ID is required.";
  }
}

function projectMessage(code: ProjectMutationValidationError["code"]) {
  switch (code) {
    case "area_not_found": return "Area not found.";
    case "conflicting_area_fields": return "Conflicting Area fields.";
    case "project_not_found": return "Project not found.";
  }
}

function parseDateOnly(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}
