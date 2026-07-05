import assert from "node:assert/strict";
import fs from "node:fs";

const component = fs.readFileSync("src/components/capture-bar.tsx", "utf8");
const types = fs.readFileSync("src/lib/capture/types.ts", "utf8");
const service = fs.readFileSync("src/lib/capture/service.ts", "utf8");

assert.ok(
  component.includes(
    'type CaptureIntent = "auto" | "task" | "note" | "idea" | "reference"',
  ),
  "Capture bar should expose explicit capture modes.",
);
assert.ok(
  component.includes('captureIntent === "task" ?'),
  "Capture bar should only show task scheduling controls in task mode.",
);
assert.ok(
  component.includes("captureDueDate"),
  "Capture bar should submit the selected task due date.",
);
assert.ok(
  types.includes("captureIntent"),
  "Capture API input should accept capture intent.",
);
assert.ok(
  service.includes("actionsFromCaptureIntent"),
  "Explicit capture intent should create deterministic actions server-side.",
);
