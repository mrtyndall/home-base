import { flattenAreaOptions, type AreaOption } from "@/lib/hierarchy";

export type ReadLaterAreaRecord = {
  id: string;
  name: string;
  parentAreaId: string | null;
  sortOrder: number;
  status: string;
  isSystem: boolean;
};

export function buildReadLaterAreaContext(
  areas: readonly ReadLaterAreaRecord[],
) {
  const visibleAreas = areas.filter((area) => !area.isSystem);
  const allOptions = flattenAreaOptions(visibleAreas);
  const activeIds = new Set(
    visibleAreas
      .filter((area) => area.status === "active")
      .map((area) => area.id),
  );
  return {
    pathById: new Map(allOptions.map((area) => [area.id, area.path])),
    activeOptions: allOptions.filter((area) => activeIds.has(area.id)) as AreaOption[],
    activeAreaIds: [...activeIds],
  };
}

export function readLaterFilingPath(
  item: {
    areaId: string | null;
    project: { name: string; areaId: string | null } | null;
  },
  pathById: ReadonlyMap<string, string>,
) {
  if (item.project) {
    const areaPath = item.project.areaId
      ? pathById.get(item.project.areaId) ?? "Area"
      : "No area yet";
    return `${areaPath} / ${item.project.name}`;
  }
  return item.areaId ? pathById.get(item.areaId) ?? "Area" : "Unfiled";
}
