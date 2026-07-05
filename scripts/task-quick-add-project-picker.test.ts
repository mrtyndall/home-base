import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/components/task-quick-add.tsx", "utf8");

assert.ok(
  source.includes('list="quick-add-projects"'),
  "Quick-add project assignment should use a searchable project field.",
);
assert.ok(
  source.includes("Search projects"),
  "Quick-add project field should make its purpose visible.",
);
assert.ok(
  !source.includes("onClick={() => setProjectId(project.id)}"),
  "Quick-add should not render the full project list as buttons.",
);
