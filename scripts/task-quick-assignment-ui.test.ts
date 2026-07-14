import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const detailSource = readFileSync("src/app/tasks/[taskId]/page.tsx", "utf8");
const componentPath = "src/components/task-quick-assignment.tsx";
const componentSource = existsSync(componentPath)
  ? readFileSync(componentPath, "utf8")
  : "";

assert.match(
  detailSource,
  /!task\.areaId && !task\.projectId/,
  "Quick filing must only render for an unassigned task.",
);
assert.match(
  detailSource,
  /task\.status === ["']open["'][\s\S]{0,180}!task\.areaId && !task\.projectId/,
  "Quick filing must only render while the task is open.",
);
assert.match(componentSource, /Assign to Area or Project/);
assert.match(componentSource, /api\/tasks\/\$\{taskId\}\/assignment/);
assert.match(
  componentSource,
  /projectId\s*\?\s*null\s*:\s*areaId/,
  "Project selection must let the endpoint derive its Area.",
);
assert.match(
  componentSource,
  /candidate\.areaId !== nextAreaId[\s\S]{0,120}setProjectId\(["']{2}\)/,
  "Changing Area must clear a Project that belongs elsewhere.",
);
assert.match(
  componentSource,
  /Assignment was not updated\./,
  "A failed assignment must show actionable feedback.",
);
assert.match(
  componentSource,
  /aria-live=["']polite["']/,
  "Assignment feedback must be announced to assistive technology.",
);
assert.ok(
  (componentSource.match(/h-11/g) ?? []).length >= 3,
  "The trigger and picker controls must provide 44px touch targets.",
);
assert.match(componentSource, /router\.refresh\(\)/, "Success must refresh task detail.");
