import assert from "node:assert/strict";
import { getRecentCaptureAction } from "../src/lib/today-capture-actions";

assert.deepEqual(getRecentCaptureAction(null, "ambiguous"), {
  label: "Sort",
  tone: "primary",
});

assert.deepEqual(
  getRecentCaptureAction([{ type: "pending_capture", id: "c1", label: "Saved" }], "failed"),
  {
    label: "Sort",
    tone: "primary",
  },
);

assert.deepEqual(
  getRecentCaptureAction([{ type: "task", id: "t1", label: "Task added" }], "parsed"),
  {
    label: "Open task",
    tone: "secondary",
  },
);

assert.deepEqual(
  getRecentCaptureAction([{ type: "idea", id: "i1", label: "Idea saved" }], "parsed"),
  {
    label: "Open ideas",
    tone: "secondary",
  },
);
