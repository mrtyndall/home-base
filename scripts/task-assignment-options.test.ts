import assert from "node:assert/strict";
import fs from "node:fs";
import { assignmentProjectLabel } from "../src/lib/task-assignment-options";

const duplicateProject = {
  id: "project-1",
  name: "Planning",
  areaId: "area-work",
  areaName: "Work",
};

assert.equal(
  assignmentProjectLabel(duplicateProject, ""),
  "Planning — Work",
  "An unscoped Project picker must distinguish duplicate names by Area.",
);
assert.equal(
  assignmentProjectLabel(duplicateProject, "area-work"),
  "Planning",
  "Once an Area scopes the picker, the redundant Area suffix should disappear.",
);

const detailSource = fs.readFileSync("src/app/tasks/[taskId]/page.tsx", "utf8");
const assignmentRouteSource = fs.readFileSync(
  "src/app/api/tasks/[taskId]/assignment/route.ts",
  "utf8",
);
assert.match(
  detailSource,
  /area:\s*\{\s*is:\s*\{\s*status:\s*"active",\s*isSystem:\s*false\s*\}\s*\}/,
  "Quick filing must fetch Projects only through active, non-system Areas.",
);
assert.match(
  detailSource,
  /area:\s*\{\s*select:\s*\{\s*name:\s*true\s*\}\s*\}/,
  "Quick filing must fetch each Project's Area name for disambiguation.",
);
assert.match(
  assignmentRouteSource,
  /if \(projectId && !project\)\s*\{[\s\S]{0,240}status:\s*404[\s\S]{0,80}\}/,
  "An explicitly requested ineligible Project must be rejected before destination resolution.",
);
assert.ok(
  assignmentRouteSource.indexOf("if (projectId && !project)") <
    assignmentRouteSource.indexOf("destination = await resolveVerifiedDestination"),
  "The ineligible-Project guard must run before destination resolution.",
);
