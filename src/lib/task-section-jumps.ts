type TaskSectionJumpCounts = {
  todayCount: number;
  tomorrowCount: number;
  upcomingCount: number;
  somedayCount: number;
  unscheduledCount: number;
};

export function buildTaskSectionJumps({
  todayCount,
  tomorrowCount,
  upcomingCount,
  somedayCount,
  unscheduledCount,
}: TaskSectionJumpCounts) {
  return [
    { href: "#today", label: "Today", count: todayCount },
    { href: "#tomorrow", label: "Tomorrow", count: tomorrowCount },
    { href: "#upcoming", label: "Upcoming", count: upcomingCount },
    { href: "#someday", label: "Someday", count: somedayCount },
    { href: "#unscheduled", label: "Unscheduled", count: unscheduledCount },
  ].map((jump) => ({ ...jump, hasItems: jump.count > 0 }));
}
