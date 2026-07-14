export type AssignmentProjectOption = {
  id: string;
  name: string;
  areaId: string | null;
  areaName: string | null;
};

export function assignmentProjectLabel(
  project: AssignmentProjectOption,
  selectedAreaId: string,
) {
  return selectedAreaId
    ? project.name
    : `${project.name} — ${project.areaName ?? "No area yet"}`;
}
