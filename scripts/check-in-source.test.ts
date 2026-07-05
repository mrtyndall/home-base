import assert from "node:assert/strict";
import { checkInSourceLabel } from "../src/lib/check-in-source";

assert.equal(checkInSourceLabel("manual"), "Manual");
assert.equal(checkInSourceLabel("ai_draft"), "Generated draft");
assert.equal(checkInSourceLabel("ai_draft_edited"), "Edited generated draft");
assert.equal(checkInSourceLabel("voice"), "Voice");
assert.equal(checkInSourceLabel("manual", "capture_1"), "Capture");
assert.equal(checkInSourceLabel("voice", "capture_1"), "Voice capture");
