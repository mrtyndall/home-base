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
  source.includes("Choose area"),
  "Capture filing should not default to the first area in the list.",
);
assert.ok(
  source.includes('type="button"'),
  "Task/Idea/Note/Reference choices should not submit immediately.",
);
