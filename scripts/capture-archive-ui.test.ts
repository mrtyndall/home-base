import assert from "node:assert/strict";
import fs from "node:fs";

const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const inboxPage = fs.readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const todayPage = fs.readFileSync("src/app/today/page.tsx", "utf8");
const dismissActionPath = "src/components/capture-dismiss-action.tsx";
const dismissAction = fs.existsSync(dismissActionPath)
  ? fs.readFileSync(dismissActionPath, "utf8")
  : "";

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

assert.ok(
  fs.existsSync(dismissActionPath),
  "Capture review cards need a reusable confirmed dismissal control.",
);
assert.match(dismissAction, /import \{ dismissCapture \} from "@\/app\/actions"/);
assert.match(dismissAction, /role="dialog"/);
assert.match(dismissAction, /aria-modal="true"/);
assert.match(dismissAction, />\s*Keep capture\s*</);
assert.match(dismissAction, />\s*Dismiss capture\s*</);
assert.match(dismissAction, /min-h-11|h-11/);
assert.match(dismissAction, /event\.key !== "Tab"/, "The modal must keep keyboard focus inside itself.");
assert.match(dismissAction, /triggerRef\.current\?\.focus\(\)/, "Closing must restore focus to the Dismiss trigger.");
assert.match(
  fs.readFileSync("src/components/capture-file-actions.tsx", "utf8"),
  /h-11[^"]*sm:h-\[30px\]/,
  "File and Dismiss must be peer-sized 44px controls on mobile.",
);
assert.match(
  dismissCaptureBody,
  /prisma\.\$transaction/,
  "Capture status and its audit notification must commit atomically.",
);
assert.match(
  dismissCaptureBody,
  /capture\.updateMany\([\s\S]*status: "active"[\s\S]*status: "dismissed"/,
  "Dismissal must use a conditional state transition so retries and concurrent submits are idempotent.",
);
assert.match(
  todayPage,
  /<CaptureDismissAction captureId=\{capture\.id\} \/>/,
  "Today review cards must expose confirmed dismissal.",
);
assert.match(
  inboxPage,
  /<CaptureDismissAction captureId=\{capture\.id\} \/>/,
  "Inbox capture cards must use the same confirmed dismissal control.",
);
