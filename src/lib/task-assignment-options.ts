export type AssignmentProjectOption = {
  id: string;
  name: string;
  areaId: string;
  areaName: string;
};

export function assignmentProjectLabel(
  project: AssignmentProjectOption,
  selectedAreaId: string,
) {
  return selectedAreaId ? project.name : `${project.name} — ${project.areaName}`;
}
