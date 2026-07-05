import assert from "node:assert/strict";
import fs from "node:fs";

const settingsPage = fs.readFileSync("src/app/settings/page.tsx", "utf8");
const copyLine = fs.readFileSync("src/components/settings/copy-line.tsx", "utf8");

assert.ok(
  settingsPage.includes("min-w-0 max-w-2xl") &&
    settingsPage.includes("pb-12"),
  "Settings page should constrain mobile width and leave room above the dock.",
);

assert.ok(
  settingsPage.includes("min-w-0 overflow-hidden rounded-[14px]"),
  "Settings integration cards should contain wide content instead of widening the viewport.",
);

assert.ok(
  settingsPage.includes("[&_p]:break-words"),
  "Settings card copy should wrap on narrow mobile viewports.",
);

assert.ok(
  copyLine.includes("overflow-hidden") &&
    copyLine.includes("overflow-x-auto") &&
    copyLine.includes("whitespace-nowrap"),
  "CopyLine should scroll long URLs inside the pill without forcing page overflow.",
);
