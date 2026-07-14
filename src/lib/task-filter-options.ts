type ProjectFilterSource = {
  id: string;
  name: string;
  area: {
    id: string;
    name: string;
  };
};

type ProjectFilterGroup = {
  areaName: string;
  projects: Array<{ id: string; name: string }>;
};

export function buildProjectFilterGroups(
  projects: ProjectFilterSource[],
  selectedAreaId: string | undefined,
): ProjectFilterGroup[] {
  const groups = new Map<string, ProjectFilterGroup>();

  for (const project of projects) {
    if (selectedAreaId && project.area.id !== selectedAreaId) {
      continue;
    }

    const areaName = project.area.name;
    const group = groups.get(areaName) ?? { areaName, projects: [] };
    group.projects.push({ id: project.id, name: project.name });
    groups.set(areaName, group);
  }

  return Array.from(groups.values());
}
