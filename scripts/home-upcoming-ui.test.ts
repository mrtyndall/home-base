import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const homeSource = readFileSync("src/app/page.tsx", "utf8");

assert.match(homeSource, /SectionHeader title="Upcoming"/);
assert.match(homeSource, /calendar-events\/\$\{item\.id\}/);
assert.match(homeSource, /tasks\/\$\{item\.id\}/);
