import assert from "node:assert/strict";
import fs from "node:fs";
import { formatRecurrenceRule } from "../src/lib/recurrence";

const taskDetail = fs.readFileSync("src/app/tasks/[taskId]/page.tsx", "utf8");
const projectDetail = fs.readFileSync(
  "src/app/projects/[projectId]/page.tsx",
  "utf8",
);

assert.equal(formatRecurrenceRule("FREQ=MONTHLY"), "Monthly");

assert.ok(
  taskDetail.includes("Description") && taskDetail.includes("Labels"),
  "Task detail should expose description and labels.",
);

assert.ok(
  projectDetail.includes("TaskStarButton") &&
    projectDetail.includes("TaskCompleteButton") &&
    projectDetail.includes("formatRecurrenceRule(task.recurrenceRule)"),
  "Project task rows should use the same task controls and human recurrence labels as task lists.",
);
