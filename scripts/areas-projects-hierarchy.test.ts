import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/app/projects/page.tsx", "utf8");

assert.ok(
  source.includes("function RecentProjectsRail"),
  "Projects route should expose only a recent projects rail below areas.",
);
assert.ok(
  source.includes("function AreaCard"),
  "Projects route should keep area cards as the primary surface.",
);
assert.equal(
  source.includes("function ProjectShelf"),
  false,
  "Global project shelves should not return to the Projects route.",
);
assert.equal(
  source.includes('title="Active"'),
  false,
  "Projects route should not globally shelf active projects above areas.",
);
