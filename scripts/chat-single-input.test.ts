import assert from "node:assert/strict";
import fs from "node:fs";

const dock = fs.readFileSync("src/components/app-dock.tsx", "utf8");
const shell = fs.readFileSync("src/components/app-shell.tsx", "utf8");

assert.ok(
  dock.includes('pathname !== "/chat"'),
  "Chat should hide the global capture bar to avoid double inputs.",
);
assert.ok(
  shell.includes("<AppDock />"),
  "The app shell should delegate bottom dock behavior to the path-aware dock.",
);
