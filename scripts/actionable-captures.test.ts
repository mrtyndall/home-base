import assert from "node:assert/strict";
import {
  isActionableCapture,
  selectActionableCaptures,
} from "../src/lib/actionable-captures";

const processedTaskCapture = {
  status: "active",
  parseStatus: "parsed",
  createdItems: [{ type: "task", id: "task-1", label: "Task added" }],
};

assert.equal(
  isActionableCapture(processedTaskCapture),
  false,
  "A processed capture whose task already exists is a receipt, not review work.",
);
assert.equal(
  isActionableCapture({ status: "active", parseStatus: null, createdItems: null }),
  true,
  "An active capture that has not been parsed is pending review.",
);
assert.equal(
  isActionableCapture({
    status: "active",
    parseStatus: "ambiguous",
    createdItems: [{ type: "pending_capture", id: "capture-1", label: "Saved" }],
  }),
  true,
);
assert.equal(
  isActionableCapture({ status: "active", parseStatus: "failed", createdItems: [] }),
  true,
);
assert.equal(
  isActionableCapture({
    status: "active",
    parseStatus: "parsed",
    createdItems: [{ type: "pending_capture", id: "capture-2", label: "Saved" }],
  }),
  true,
  "A pending-capture marker remains actionable even if its parse status is parsed.",
);
assert.equal(
  isActionableCapture({ status: "dismissed", parseStatus: "failed", createdItems: [] }),
  false,
  "Dismissed captures never return to the review queue.",
);

const olderActionableCapture = {
  id: "needs-review",
  status: "active",
  parseStatus: "failed",
  createdItems: [],
};
const newerProcessedCaptures = Array.from({ length: 7 }, (_, index) => ({
  id: `processed-${index}`,
  ...processedTaskCapture,
}));

assert.deepEqual(
  selectActionableCaptures(
    [...newerProcessedCaptures, olderActionableCapture],
    5,
  ).map((capture) => capture.id),
  ["needs-review"],
  "Filtering must happen before the display limit so newer receipts cannot hide review work.",
);
