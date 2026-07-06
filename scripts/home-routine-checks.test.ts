import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/components/home-action-buttons.tsx", "utf8");
const routineComponent = source.slice(
  source.indexOf("export function HomeRoutineCheck"),
);

assert.ok(
  routineComponent.includes("aria-pressed={completed}"),
  "Home routine controls should expose checked/unchecked state.",
);

assert.ok(
  routineComponent.includes("<Check") && routineComponent.includes("w-4"),
  "Home routine controls should render a visible check target, not inert chips.",
);
