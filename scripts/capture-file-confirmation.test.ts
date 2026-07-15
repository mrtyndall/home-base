import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/components/capture-file-actions.tsx",
  "utf8",
);

assert.ok(
  source.includes("Confirm file"),
  "Capture filing should require a confirm step after choosing type and area.",
);
assert.ok(
  source.includes("selectedAreaName"),
  "Confirmation should show the selected destination area name.",
);
assert.ok(
  source.includes("Global / Inbox"),
  "Capture filing should allow an explicit global/unfiled destination.",
);
assert.ok(
  source.includes("defaultProjectId") && source.includes('name="projectId"'),
  "Capture filing should accept and submit a suggested or manually selected Project.",
);
assert.ok(
  source.includes("projects.map"),
  "Capture filing should render Project choices alongside Areas.",
);
assert.ok(
  !source.includes("disabled={!selectedAreaName}"),
  "Global filing should not be blocked by a missing Area.",
);
assert.ok(
  source.includes('type="button"'),
  "Task/Idea/Note/Reference choices should not submit immediately.",
);
