import assert from "node:assert/strict";
import fs from "node:fs";

const areaPage = fs.readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const reviewActions = fs.readFileSync("src/app/review-actions.ts", "utf8");

assert.ok(
  areaPage.includes("Snooze 1 day"),
  "Review cards should expose the clear default snooze action.",
);
assert.ok(
  !areaPage.includes("Bring this review back on"),
  "The default review action should not open an empty date input.",
);
assert.ok(
  reviewActions.includes("export async function snoozeReviewOneDay"),
  "Review actions should have a one-day snooze helper.",
);
assert.ok(
  reviewActions.includes("addDaysToDateString(localDateString(), 1)"),
  "One-day snooze should suppress the review until tomorrow.",
);
