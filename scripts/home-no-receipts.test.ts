import assert from "node:assert/strict";
import fs from "node:fs";

const homePage = fs.readFileSync("src/app/page.tsx", "utf8");

assert.ok(
  !homePage.includes("<RecentCaptures") &&
    !homePage.includes("function RecentCaptures"),
  "Home should not call out recent capture receipts as a primary section.",
);

assert.ok(
  !homePage.includes("Recently captured"),
  "Home should not label receipt trails as a homepage surface.",
);

assert.ok(
  !homePage.includes("CaptureFileActions"),
  "Home should not expose capture filing controls; filing belongs in Inbox.",
);
