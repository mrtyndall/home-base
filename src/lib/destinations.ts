import { prisma } from "@/lib/db";

export type DestinationInput = {
  areaId?: string | null;
  projectId?: string | null;
};

export function normalizeDestination(input: DestinationInput) {
  const areaId = input.areaId?.trim() || null;
  const projectId = input.projectId?.trim() || null;
  if (projectId && !areaId) {
    throw new Error("Project destinations require an Area.");
  }
  return { areaId, projectId };
}

type DestinationClient = {
  area: {
    findFirst(args: unknown): PromiseLike<{ id: string } | null>;
  };
  project: {
    findFirst(args: unknown): PromiseLike<{ id: string; areaId: string } | null>;
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
      where: { id: destination.areaId, status: "active" },
      select: { id: true },
    });
    if (!area) throw new Error("Area not found.");
    return destination;
  }

  const project = await client.project.findFirst({
    where: { id: destination.projectId },
    select: { id: true, areaId: true },
  });
  if (!project || project.areaId !== destination.areaId) {
    throw new Error("Project does not belong to the selected Area.");
  }
  return destination;
}

export function destinationKind(input: DestinationInput) {
  const destination = normalizeDestination(input);
  if (destination.projectId) return "project" as const;
  if (destination.areaId) return "area" as const;
  return "inbox" as const;
}
