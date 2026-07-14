import { prisma } from "@/lib/db";

export type DestinationInput = {
  areaId?: string | null;
  projectId?: string | null;
};

export type ParentDestinationInput = DestinationInput & {
  parentType?: "area" | "project" | null;
  parentId?: string | null;
};

export function normalizeParentDestination(input: ParentDestinationInput) {
  const parentType = input.parentType ?? null;
  const parentId = input.parentId?.trim() || null;
  if ((parentType === null) !== (parentId === null)) {
    throw new Error("parentType and parentId must be provided together.");
  }

  const areaId = input.areaId?.trim() || null;
  const projectId = input.projectId?.trim() || null;
  if (parentType === "area") {
    if (projectId || (areaId && areaId !== parentId)) {
      throw new Error("Conflicting destination fields.");
    }
    return { areaId: parentId, projectId: null };
  }
  if (parentType === "project") {
    if (areaId || (projectId && projectId !== parentId)) {
      throw new Error("Conflicting destination fields.");
    }
    return { areaId: null, projectId: parentId };
  }
  return { areaId, projectId };
}

export function normalizeDestination(input: DestinationInput) {
  const areaId = input.areaId?.trim() || null;
  const projectId = input.projectId?.trim() || null;
  return { areaId, projectId };
}

type DestinationClient = {
  area: {
    findFirst(args: unknown): PromiseLike<{ id: string } | null>;
  };
  project: {
    findFirst(args: unknown): PromiseLike<{ id: string; areaId: string | null } | null>;
  };
};

export async function resolveVerifiedDestination(
  input: DestinationInput,
  client: DestinationClient = prisma as unknown as DestinationClient,
) {
  const destination = normalizeDestination(input);
  if (!destination.projectId) {
    if (!destination.areaId) return destination;
    const area = await client.area.findFirst({
      where: { id: destination.areaId, status: "active", isSystem: false },
      select: { id: true },
    });
    if (!area) throw new Error("Area not found.");
    return destination;
  }

  const project = await client.project.findFirst({
    where: {
      id: destination.projectId,
      status: { in: ["active", "parked", "someday"] },
    },
    select: { id: true, areaId: true },
  });
  if (!project) {
    throw new Error("Project not found.");
  }
  if (destination.areaId && destination.areaId !== project.areaId) {
    throw new Error("Project does not belong to the selected Area.");
  }
  return { projectId: destination.projectId, areaId: project.areaId };
}

export function destinationKind(input: DestinationInput) {
  const destination = normalizeDestination(input);
  if (destination.projectId) return "project" as const;
  if (destination.areaId) return "area" as const;
  return "inbox" as const;
}
