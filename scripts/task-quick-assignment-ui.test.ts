import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detailSource = readFileSync("src/app/tasks/[taskId]/page.tsx", "utf8");
const componentSource = readFileSync("src/components/task-quick-edit.tsx", "utf8");

assert.match(
  detailSource,
  /task\.status === ["']open["'][\s\S]{0,120}<TaskQuickEdit/,
  "Quick edit must render for every open task.",
);
assert.match(componentSource, /Move task/);
assert.match(componentSource, /api\/tasks\/\$\{taskId\}\/assignment/);
assert.match(
  componentSource,
  /areaId:\s*next\.areaId,\s*projectId:\s*next\.projectId/,
  "Quick edit must send the exact selected destination to the validated endpoint.",
);
assert.match(
  componentSource,
  /assignment-options/,
  "Destination choices must be loaded from the lazy endpoint.",
);
assert.match(
  componentSource,
  /Couldn’t update task/,
  "A failed assignment must show actionable feedback.",
);
assert.match(
  componentSource,
  /aria-live=["']polite["']/,
  "Assignment feedback must be announced to assistive technology.",
);
assert.ok(
  (componentSource.match(/(?:h-11|min-h-11)/g) ?? []).length >= 3,
  "The trigger and picker controls must provide 44px touch targets.",
);
assert.match(componentSource, /router\.refresh\(\)/, "Success must refresh task detail.");
