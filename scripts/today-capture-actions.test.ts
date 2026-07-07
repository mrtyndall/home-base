import assert from "node:assert/strict";
import {
  getRecentCaptureAction,
  getRecentCaptureHref,
} from "../src/lib/today-capture-actions";

assert.deepEqual(getRecentCaptureAction(null, "ambiguous"), {
  label: "Sort",
  tone: "primary",
});

assert.deepEqual(
  getRecentCaptureAction(
    [{ type: "pending_capture", id: "c1", label: "Saved" }],
    "failed",
  ),
  {
    label: "Sort",
    tone: "primary",
  },
);

assert.deepEqual(
  getRecentCaptureAction(
    [{ type: "task", id: "t1", label: "Task added" }],
    "parsed",
  ),
  {
    label: "Open task",
    tone: "secondary",
  },
);

assert.deepEqual(
  getRecentCaptureAction(
    [{ type: "idea", id: "i1", label: "Idea saved" }],
    "parsed",
  ),
  {
    label: "Open ideas",
    tone: "secondary",
  },
);

assert.deepEqual(
  getRecentCaptureAction(
    [{ type: "created_task", id: "t2", label: "Task in Inbox: Test 3" }],
    "parsed",
  ),
  {
    label: "Open task",
    tone: "secondary",
  },
);

assert.equal(
  getRecentCaptureHref({
    id: "c0",
    rawText: "Test 3",
    createdItems: [
      { type: "created_task", id: "t2", label: "Task in Inbox: Test 3" },
    ],
  }),
  "/tasks/t2",
);

assert.equal(
  getRecentCaptureHref({
    id: "c1",
    rawText: "loose thought",
    createdItems: [
      { type: "pending_capture", id: "c1", label: "Saved to Inbox" },
    ],
  }),
  "/captures/c1",
);

assert.equal(
  getRecentCaptureHref({
    id: "c2",
    rawText: "note for project",
    createdItems: [{ type: "entity_note", id: "n1", label: "Note added" }],
  }),
  "/notes/n1",
);

assert.equal(
  getRecentCaptureHref({
    id: "c3",
    rawText: "weekly check-in",
    createdItems: [{ type: "check_in", id: "ci1", label: "Check-in added" }],
  }),
  "/check-ins/ci1",
);

assert.equal(
  getRecentCaptureHref({
    id: "c4",
    rawText: "club net is Tuesday",
    createdItems: [{ type: "reference", id: "r1", label: "Reference saved" }],
  }),
  "/references/r1",
);

assert.ok(
  !getRecentCaptureHref({
    id: "c5",
    rawText: "unknown parsed thing",
    createdItems: [{ type: "unknown", id: "x1", label: "Saved" }],
  }).startsWith("/search"),
  "Recent capture links should open a real destination or Inbox sorting, never Search.",
);
