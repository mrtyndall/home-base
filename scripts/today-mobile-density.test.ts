import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const todaySource = readFileSync("src/app/today/page.tsx", "utf8");
const dashboardSource = readFileSync("src/lib/today.ts", "utf8");
const dropZoneSource = readFileSync("src/components/task-scheduling.tsx", "utf8");

assert.match(todaySource, /Captures to review/);
assert.doesNotMatch(todaySource, /Recent captures/);
assert.match(todaySource, /selectActionableCaptures\(captures\)/);
assert.match(
  dashboardSource,
  /prisma\.capture\.findMany\(\{[\s\S]{0,200}where: \{ status: "active" \}[\s\S]{0,200}take: 50/,
  "Today must inspect a bounded review window larger than the rendered capture count.",
);
assert.match(todaySource, /space-y-5 sm:space-y-7/);
assert.match(
  dropZoneSource,
  /isEmpty \? "min-h-0 sm:min-h-20"/,
  "Empty drop zones should not reserve card-height whitespace on mobile.",
);
assert.match(
  dropZoneSource,
  /isEmpty \? "min-h-0 sm:min-h-20" : "min-h-20"/,
  "Only mobile empty drop zones should collapse; desktop and populated zones retain their height.",
);
