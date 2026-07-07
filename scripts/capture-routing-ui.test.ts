import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const captureActions = readFileSync(
  join(root, "src/lib/today-capture-actions.ts"),
  "utf8",
);
const captureFileActions = readFileSync(
  join(root, "src/components/capture-file-actions.tsx"),
  "utf8",
);
const capturePagePath = join(root, "src/app/captures/[captureId]/page.tsx");
const actions = readFileSync(join(root, "src/app/actions.ts"), "utf8");

assert.ok(
  existsSync(capturePagePath),
  "captures must have a dedicated detail route",
);
assert.ok(
  captureActions.includes("return `/captures/${capture.id}`"),
  "recent capture fallback must open the capture detail page",
);
assert.ok(
  !captureActions.includes('return "/areas/area_inbox#pending-captures";'),
  "recent capture fallback should not jump to the generic Inbox anchor",
);
assert.ok(
  !captureFileActions.includes("<select"),
  "capture filing destination should use an in-app chooser, not a native select",
);
assert.ok(
  captureFileActions.includes("Confirm file"),
  "capture filing must require an explicit confirmation",
);
assert.ok(
  actions.includes("revalidatePath(`/captures/${capture.id}`)"),
  "capture conversion must revalidate the capture detail page",
);

console.log("capture routing and filing UI contracts passed");
