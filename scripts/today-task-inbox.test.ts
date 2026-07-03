import assert from "node:assert/strict";
import { getTodayTaskInboxLimit } from "../src/lib/today-task-inbox";

assert.equal(getTodayTaskInboxLimit(), 6);
