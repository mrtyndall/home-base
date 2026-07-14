import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const todaySource = readFileSync("src/app/today/page.tsx", "utf8");
const dropZoneSource = readFileSync("src/components/task-scheduling.tsx", "utf8");

assert.match(todaySource, /Captures to review/);
assert.doesNotMatch(todaySource, /Recent captures/);
assert.match(todaySource, /captures\.filter\(isActionableCapture\)/);
assert.match(todaySource, /space-y-5 sm:space-y-7/);
assert.match(
  dropZoneSource,
  /isEmpty \? "min-h-0"/,
  "Empty drop zones should not reserve card-height whitespace.",
);
assert.match(
  dropZoneSource,
  /isEmpty \? "min-h-0" : "min-h-20"/,
  "Populated drop zones must retain their drag target height.",
);
