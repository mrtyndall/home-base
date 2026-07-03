import assert from "node:assert/strict";
import { buildTaskSectionJumps } from "../src/lib/task-section-jumps";

const jumps = buildTaskSectionJumps({
  todayCount: 0,
  tomorrowCount: 2,
  upcomingCount: 0,
  somedayCount: 0,
  unscheduledCount: 2,
});

assert.deepEqual(
  jumps.map((jump) => [jump.label, jump.count, jump.hasItems]),
  [
    ["Today", 0, false],
    ["Tomorrow", 2, true],
    ["Upcoming", 0, false],
    ["Someday", 0, false],
    ["Unscheduled", 2, true],
  ],
);
