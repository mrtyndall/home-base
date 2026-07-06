import assert from "node:assert/strict";
import fs from "node:fs";

const tasksPage = fs.readFileSync("src/app/tasks/page.tsx", "utf8");
const scheduling = fs.readFileSync("src/components/task-scheduling.tsx", "utf8");

assert.ok(
  !tasksPage.includes("lg:grid-cols-2"),
  "Schedule sections should render in one ordered flow instead of staggered desktop columns.",
);

assert.ok(
  !tasksPage.includes("lg:col-start-2"),
  "Someday should sit in the normal section order, not be pinned into a second column.",
);

assert.ok(
  scheduling.includes("isInteractiveTaskControl"),
  "Task rows should allow drag-from-row while protecting buttons and form controls.",
);

assert.ok(
  !scheduling.includes('<span className="hidden sm:inline">Move</span>'),
  "Task row scheduling controls should be icon-first, not display the word Move.",
);
