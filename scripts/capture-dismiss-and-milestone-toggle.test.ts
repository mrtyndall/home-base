import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const areaPage = fs.readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const homePage = fs.readFileSync("src/app/page.tsx", "utf8");
const projectsPage = fs.readFileSync("src/app/projects/page.tsx", "utf8");
const todayPage = fs.readFileSync("src/app/today/page.tsx", "utf8");
const entityDepth = fs.readFileSync("src/components/entity-depth.tsx", "utf8");

assert.ok(
  schema.includes("enum CaptureStatus") &&
    schema.includes("active") &&
    schema.includes("dismissed"),
  "Captures need a lifecycle status so Inbox dismissal is not a hard delete.",
);
assert.ok(
  schema.includes("status        CaptureStatus       @default(active)") ||
    schema.includes("status      CaptureStatus @default(active)"),
  "Capture.status should default to active.",
);
assert.ok(
  schema.includes("@@index([status, parseStatus, createdAt])"),
  "Pending-capture queries should be backed by a status/parseStatus index.",
);
assert.ok(
  actions.includes("export async function dismissCapture") &&
    actions.includes('status: "dismissed"') &&
    actions.includes("capture_dismissed"),
  "Dismiss should archive the capture from triage with an audit notification.",
);
assert.ok(
  !actions.includes("prisma.capture.delete"),
  "Capture dismissal must never hard-delete raw capture rows.",
);
assert.ok(
  areaPage.includes("dismissCapture") &&
    areaPage.includes("Dismiss") &&
    areaPage.includes('status: "active"'),
  "Inbox pending captures should expose a dismiss control and only show active captures.",
);
assert.ok(
  homePage.includes("status: \"active\"") &&
    projectsPage.includes("status: \"active\""),
  "Home and Projects pending-capture counts should ignore dismissed captures.",
);
assert.ok(
  todayPage.includes("capture.status === \"dismissed\""),
  "Recent capture actions should not offer filing controls for dismissed captures.",
);

assert.ok(
  actions.includes("export async function toggleMilestone") &&
    actions.includes("Milestone reopened") &&
    actions.includes('nextStatus === "completed" ? new Date() : null'),
  "Milestones should be toggleable back to open with audit activity.",
);
assert.ok(
  entityDepth.includes("toggleMilestone") &&
    entityDepth.includes("Reopen milestone") &&
    !entityDepth.includes("disabled={milestone.status === \"completed\"}"),
  "Completed milestones should remain clickable so Matt can uncheck them.",
);
