import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeUpcomingCommitments } from "../src/lib/upcoming-commitments";

const tasks = [
  {
    id: "task-day-three",
    title: "Task on day three",
    dueDate: new Date("2026-07-16T00:00:00.000Z"),
    dueTime: null,
  },
  {
    id: "untimed-tomorrow",
    title: "Untimed task tomorrow",
    dueDate: new Date("2026-07-14T00:00:00.000Z"),
    dueTime: null,
  },
];

const events = [
  {
    id: "event-tomorrow",
    title: "Event tomorrow",
    start: new Date("2026-07-14T13:00:00.000Z"),
  },
];

assert.deepEqual(
  mergeUpcomingCommitments(tasks, events, 3).map((item) => item.id),
  ["untimed-tomorrow", "event-tomorrow", "task-day-three"],
);

const sameDateTasks = ["10:00", "11:00", "12:00", "9:00"].map(
  (dueTime) => ({
    id: `task-${dueTime}`,
    title: `Task at ${dueTime}`,
    dueDate: new Date("2026-07-14T00:00:00.000Z"),
    dueTime,
  }),
);

assert.deepEqual(
  mergeUpcomingCommitments(sameDateTasks, [], 3).map((item) => item.id),
  ["task-9:00", "task-10:00", "task-11:00"],
  "The merge must receive every candidate on a bounded date so normalized time, not raw database text order, selects the first three.",
);

const todaySource = fs.readFileSync("src/lib/today.ts", "utf8");

assert.match(
  todaySource,
  /const upcomingTaskDates = await prisma\.task\.groupBy/,
  "The dashboard should bound upcoming task candidates by distinct dates before merging.",
);
assert.match(
  todaySource,
  /dueDate: \{ gt: todayDate, lte: upcomingTaskDateLimit \}/,
  "The dashboard should fetch every task through the bounded date window.",
);
