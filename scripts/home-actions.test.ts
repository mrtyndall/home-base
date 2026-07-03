import assert from "node:assert/strict";
import {
  getInboxActionLabel,
  getTasksActionLabel,
  getTodayActionLabel,
} from "../src/lib/home-actions";

assert.equal(getTodayActionLabel(0), "Open Today");
assert.equal(getTodayActionLabel(1), "Handle 1 item");
assert.equal(getTodayActionLabel(4), "Handle 4 items");

assert.equal(getInboxActionLabel(0), "Open Inbox");
assert.equal(getInboxActionLabel(1), "Sort 1 capture");
assert.equal(getInboxActionLabel(3), "Sort 3 captures");

assert.equal(getTasksActionLabel(0, 0), "Open Tasks");
assert.equal(getTasksActionLabel(2, 0), "Plan today");
assert.equal(getTasksActionLabel(0, 4), "Review tomorrow");
