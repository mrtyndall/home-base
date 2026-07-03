export type TaskSectionFilter =
  | "all"
  | "today"
  | "tomorrow"
  | "upcoming"
  | "someday"
  | "unscheduled";

export type TaskViewFilter = "schedule" | "open" | "done" | "all" | "routines";

const taskViews = new Set<TaskViewFilter>([
  "schedule",
  "open",
  "done",
  "all",
  "routines",
]);

export function normalizeTaskView(
  value: string | string[] | undefined,
): TaskViewFilter {
  const view = Array.isArray(value) ? value[0] : value;
  return view && taskViews.has(view as TaskViewFilter)
    ? (view as TaskViewFilter)
    : "schedule";
}

const taskSections = new Set<TaskSectionFilter>([
  "all",
  "today",
  "tomorrow",
  "upcoming",
  "someday",
  "unscheduled",
]);

export function normalizeFilterValues(
  value: string | string[] | undefined,
  validValues: string[],
) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const validSet = new Set(validValues);
  const seen = new Set<string>();
  return values.filter((item) => {
    if (!validSet.has(item) || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export function normalizeTaskSection(
  value: string | string[] | undefined,
): TaskSectionFilter {
  const section = Array.isArray(value) ? value[0] : value;
  return section && taskSections.has(section as TaskSectionFilter)
    ? (section as TaskSectionFilter)
    : "all";
}

export function normalizeStarredFilter(
  value: string | string[] | undefined,
): boolean {
  const starred = Array.isArray(value) ? value[0] : value;
  return starred === "1" || starred === "true";
}

export function toggleFilterValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function buildTasksFilterHref({
  domains,
  projects,
  section,
  starred,
  view,
}: {
  domains: string[];
  projects: string[];
  section: TaskSectionFilter;
  starred?: boolean;
  view?: TaskViewFilter;
}) {
  const params = new URLSearchParams();
  for (const domain of domains) params.append("domain", domain);
  for (const project of projects) params.append("project", project);
  if (section !== "all") params.set("section", section);
  if (starred) params.set("starred", "1");
  if (view && view !== "schedule") params.set("view", view);
  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
}
