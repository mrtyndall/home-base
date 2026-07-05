import assert from "node:assert/strict";
import fs from "node:fs";

const today = fs.readFileSync("src/app/today/page.tsx", "utf8");

assert.ok(
  today.includes("data.todayEvents.length > 0"),
  "Today calendar section should render only when calendar events exist.",
);
assert.ok(
  !today.includes('EmptyLine text="No calendar events today."'),
  "Empty calendar sections should not render a placeholder line.",
);
