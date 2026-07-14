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

export function destinationKind(input: DestinationInput) {
  const destination = normalizeDestination(input);
  if (destination.projectId) return "project" as const;
  if (destination.areaId) return "area" as const;
  return "inbox" as const;
}
