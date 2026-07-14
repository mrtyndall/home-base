import assert from "node:assert/strict";
import fs from "node:fs";
import { assignmentProjectLabel } from "../src/lib/task-assignment-options";

const duplicateProject = {
  id: "project-1",
  name: "Planning",
  areaId: "area-work",
  areaName: "Work",
};

const unfiledProject = {
  id: "project-2",
  name: "Loose plan",
  areaId: null,
  areaName: null,
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
assert.equal(
  assignmentProjectLabel(unfiledProject, ""),
  "Loose plan — No area yet",
  "An unfiled Project must stay available and explain its filing state.",
);

const optionsRouteSource = fs.readFileSync(
  "src/app/api/tasks/[taskId]/assignment-options/route.ts",
  "utf8",
);
const assignmentRouteSource = fs.readFileSync(
  "src/app/api/tasks/[taskId]/assignment/route.ts",
  "utf8",
);
assert.match(
  optionsRouteSource,
  /\{\s*areaId:\s*null\s*\}[\s\S]{0,120}\{\s*areaId:\s*\{\s*in:/,
  "Lazy quick filing must include unfiled Projects alongside Projects in eligible Areas.",
);
assert.match(
  optionsRouteSource,
  /label:\s*`\$\{project\.name\}\s*—\s*\$\{project\.areaId\s*\?\s*areaPaths\.get\(project\.areaId\)\s*:\s*"No area yet"\}`/,
  "Lazy quick filing must return path-labelled Projects for disambiguation.",
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
