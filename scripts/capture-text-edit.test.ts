import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const areaPage = fs.readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");

assert.ok(
  schema.includes("model CaptureTextEdit"),
  "Capture edits must be append-only instead of overwriting raw captures.",
);
assert.ok(
  actions.includes("updateCaptureText") &&
    !actions.includes("data: { rawText: editedText }"),
  "Editing capture text must not overwrite the raw capture text.",
);
assert.ok(
  actions.includes("getEffectiveCaptureText"),
  "Filing should use the latest edited capture text when present.",
);
assert.ok(
  areaPage.includes("Edit text") && areaPage.includes("Review later"),
  "Inbox triage should expose text editing and clearer review-later copy.",
);
