type ProjectFilterSource = {
  id: string;
  name: string;
  area: {
    domainId: string;
    domain: {
      name: string;
    };
  };
};

type ProjectFilterGroup = {
  domainName: string;
  projects: Array<{ id: string; name: string }>;
};

export function buildProjectFilterGroups(
  projects: ProjectFilterSource[],
  selectedDomainId: string | undefined,
): ProjectFilterGroup[] {
  const groups = new Map<string, ProjectFilterGroup>();

  for (const project of projects) {
    if (selectedDomainId && project.area.domainId !== selectedDomainId) {
      continue;
    }

    const domainName = project.area.domain.name;
    const group = groups.get(domainName) ?? { domainName, projects: [] };
    group.projects.push({ id: project.id, name: project.name });
    groups.set(domainName, group);
  }

  return Array.from(groups.values());
}
