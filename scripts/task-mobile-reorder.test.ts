import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const route = fs.readFileSync(
  "src/app/api/tasks/[taskId]/order/route.ts",
  "utf8",
);
const scheduling = fs.readFileSync(
  "src/components/task-scheduling.tsx",
  "utf8",
);

assert.ok(
  schema.includes("sortOrder") && schema.includes("sort_order"),
  "Tasks need a persisted sort order for manual rearranging.",
);

assert.ok(
  route.includes("targetTaskId") && route.includes("sortOrder"),
  "Task reorder endpoint should move a task relative to another visible task.",
);

assert.ok(
  scheduling.includes("updateTaskOrder") &&
    scheduling.includes("data-task-id") &&
    scheduling.includes("Drag task"),
  "Task rows should expose a touch-friendly drag handle that persists reorder.",
);

assert.ok(
  scheduling.includes("pointer-events-none") &&
    scheduling.includes("data-task-card-id") &&
    scheduling.includes("moveTaskCardOptimistically"),
  "Dragging should preview the card over real drop targets and move it immediately before the server refresh.",
);
