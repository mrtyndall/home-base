import assert from "node:assert/strict";
import fs from "node:fs";

const captureBar = fs.readFileSync("src/components/capture-bar.tsx", "utf8");

assert.ok(
  !captureBar.includes("<select"),
  "Capture bar should not use native select menus for filing controls.",
);

assert.ok(
  !captureBar.includes("<option"),
  "Capture bar should not use native option menus for filing controls.",
);

assert.ok(
  !captureBar.includes("<optgroup"),
  "Capture bar should not use native optgroup menus for filing controls.",
);

assert.ok(
  captureBar.includes('role="listbox"') &&
    captureBar.includes('aria-haspopup="listbox"'),
  "Capture bar filing controls should use styled listbox popovers.",
);
