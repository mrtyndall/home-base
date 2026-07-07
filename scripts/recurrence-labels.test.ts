import assert from "node:assert/strict";
import { formatRecurrenceRule } from "../src/lib/recurrence";

assert.equal(formatRecurrenceRule("FREQ=DAILY"), "Daily");
assert.equal(formatRecurrenceRule("FREQ=WEEKLY"), "Weekly");
assert.equal(formatRecurrenceRule("FREQ=MONTHLY"), "Monthly");
assert.equal(formatRecurrenceRule("FREQ=YEARLY"), "Yearly");
