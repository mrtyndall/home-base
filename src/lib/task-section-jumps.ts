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
    { href: "#today", label: "Today", count: todayCount, section: "today" },
    {
      href: "#tomorrow",
      label: "Tomorrow",
      count: tomorrowCount,
      section: "tomorrow",
    },
    {
      href: "#upcoming",
      label: "Upcoming",
      count: upcomingCount,
      section: "upcoming",
    },
    { href: "#someday", label: "Someday", count: somedayCount, section: "someday" },
    {
      href: "#unscheduled",
      label: "Unscheduled",
      count: unscheduledCount,
      section: "unscheduled",
    },
  ].map((jump) => ({ ...jump, hasItems: jump.count > 0 }));
}
