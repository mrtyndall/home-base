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

assert.match(
  captureBar,
  /label="Destination"/,
  "The capture Area assignment control must be labeled as a destination.",
);
assert.match(
  captureBar,
  /label:\s*"Global"[\s\S]{0,120}label:\s*"Inbox"/,
  "Inbox must be presented as a global destination.",
);
assert.match(
  captureBar,
  /label:\s*"Areas"[\s\S]{0,180}captureOptions\.areas\.map/,
  "Flat Areas must be listed under an Areas group.",
);
assert.doesNotMatch(
  captureBar,
  /label:\s*"System"/,
  "The destination picker must not expose legacy System taxonomy.",
);
assert.match(
  captureBar,
  /label="Project"[\s\S]{0,180}groups=\{projectPickerGroups\}/,
  "The Project picker must remain a separate Project control.",
);
