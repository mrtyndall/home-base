import assert from "node:assert/strict";
import { zonedDayBounds } from "../src/lib/dates";

const julyThird = zonedDayBounds("2026-07-03");

assert.equal(julyThird.start.toISOString(), "2026-07-03T04:00:00.000Z");
assert.equal(julyThird.end.toISOString(), "2026-07-04T04:00:00.000Z");

const priorEveningEastern = new Date("2026-07-03T00:00:00.000Z");
assert.equal(priorEveningEastern < julyThird.start, true);

const julyThirdMorningEastern = new Date("2026-07-03T15:00:00.000Z");
assert.equal(
  julyThirdMorningEastern >= julyThird.start &&
    julyThirdMorningEastern < julyThird.end,
  true,
);
