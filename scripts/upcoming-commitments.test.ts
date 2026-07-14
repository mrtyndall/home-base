import assert from "node:assert/strict";
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
