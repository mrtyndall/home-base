import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("src/app/actions.ts", "utf8");
const fileActions = readFileSync(
  "src/components/capture-file-actions.tsx",
  "utf8",
);
const globalInbox = readFileSync("src/lib/global-inbox.ts", "utf8");
const areaPage = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");

function conversionBody() {
  return actions.slice(
    actions.indexOf("export async function convertPendingCapture"),
    actions.indexOf("export async function snoozeCaptureReviewProposalOneDay"),
  );
}

test("capture review UI can accept Project, Area, or global destinations", () => {
  assert.match(fileActions, /defaultProjectId/);
  assert.match(fileActions, /name="projectId"/);
  assert.match(fileActions, /Global \/ Inbox/);
  assert.match(fileActions, /projects\.map/);
  assert.match(globalInbox, /suggestedProject:\s*true/);
  assert.match(globalInbox, /destinationProjects/);
  assert.match(areaPage, /defaultProjectId=\{proposal\.suggestedProject\?\.id \?\? ""\}/);
  assert.match(areaPage, /defaultType=\{proposal\.suggestedType\}/);
});

test("capture conversion verifies and persists the final Project destination", () => {
  const body = conversionBody();
  assert.match(body, /getTrimmedString\(formData, "projectId"\)/);
  assert.ok(
    body.includes("{ areaId, projectId },") &&
      body.includes("destination = await resolveVerifiedDestination("),
    "conversion must verify the submitted Area/Project destination",
  );
  assert.match(body, /projectId:\s*destination\.projectId/);
  assert.match(body, /parentType:\s*destination\.projectId\s*\?\s*"project"/);
  assert.match(body, /parentId:\s*destination\.projectId\s*\?\?/);
  assert.match(
    body,
    /final:\s*\{[\s\S]*areaId:\s*destination\.areaId[\s\S]*projectId:\s*destination\.projectId/,
  );
});
