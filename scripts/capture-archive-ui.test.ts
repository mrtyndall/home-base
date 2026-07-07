import assert from "node:assert/strict";
import fs from "node:fs";

const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const inboxPage = fs.readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");

const dismissCaptureBody = actions.slice(
  actions.indexOf("export async function dismissCapture"),
  actions.indexOf("export async function convertPendingCapture"),
);

assert.ok(
  dismissCaptureBody.includes('data: { status: "dismissed" }'),
  "Archiving a capture must preserve the raw capture row by status change.",
);

assert.ok(
  !dismissCaptureBody.includes("capture.delete") &&
    !dismissCaptureBody.includes("deleteMany"),
  "Capture archive must never hard-delete captures.",
);

assert.ok(
  inboxPage.includes("Archive capture") && inboxPage.includes("Archive"),
  "Pending captures should expose a clear archive action.",
);
