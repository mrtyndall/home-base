import assert from "node:assert/strict";
import fs from "node:fs";

const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const depth = fs.readFileSync("src/components/entity-depth.tsx", "utf8");

assert.ok(
  actions.includes("export async function updateEntityNote"),
  "Entity notes need an update action.",
);
assert.ok(
  depth.includes("updateEntityNote") &&
    depth.includes("Edit") &&
    depth.includes("defaultValue={note.bodyMd}"),
  "Rendered notes should expose an edit form with the current markdown.",
);
