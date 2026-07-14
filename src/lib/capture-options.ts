export type CaptureOptions = {
  areas: Array<{ id: string; name: string; status: string }>;
  projects: Array<{
    id: string;
    name: string;
    areaId: string;
    areaName: string;
  }>;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function normalizeCaptureOptions(value: unknown): CaptureOptions {
  if (!value || typeof value !== "object") return { areas: [], projects: [] };
  const input = value as Record<string, unknown>;
  const areas = Array.isArray(input.areas)
    ? input.areas.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const area = item as Record<string, unknown>;
        return isString(area.id) && isString(area.name) && isString(area.status)
          ? [{ id: area.id, name: area.name, status: area.status }]
          : [];
      })
    : [];
  const projects = Array.isArray(input.projects)
    ? input.projects.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const project = item as Record<string, unknown>;
        return isString(project.id) &&
          isString(project.name) &&
          isString(project.areaId) &&
          isString(project.areaName)
          ? [
              {
                id: project.id,
                name: project.name,
                areaId: project.areaId,
                areaName: project.areaName,
              },
            ]
          : [];
      })
    : [];
  return { areas, projects };
}
