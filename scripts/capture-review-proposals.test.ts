import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    root,
    "prisma/migrations/20260706230000_capture_review_proposals/migration.sql",
  ),
  "utf8",
);
const areaPage = readFileSync(
  join(root, "src/app/areas/[areaId]/page.tsx"),
  "utf8",
);
const actions = readFileSync(join(root, "src/app/actions.ts"), "utf8");
const route = readFileSync(
  join(root, "src/app/api/cron/capture-review-proposals/route.ts"),
  "utf8",
);
const reviewLib = readFileSync(
  join(root, "src/lib/capture/review-proposals.ts"),
  "utf8",
);

assert.match(schema, /model CaptureReviewProposal/);
assert.match(schema, /enum CaptureReviewProposalStatus/);
assert.match(migration, /CREATE TABLE "capture_review_proposals"/);
assert.match(route, /createCaptureReviewProposals/);

assert.match(areaPage, /reviewProposals/);
assert.match(areaPage, /Suggested:/);
assert.match(areaPage, /proposalId={proposal\.id}/);
assert.match(areaPage, /reviewProposals:\s*\{\s*none:/);

assert.match(actions, /proposalId/);
assert.match(actions, /captureReviewProposal\.update/);
assert.match(actions, /capture_review_accepted/);
assert.match(actions, /snoozeCaptureReviewProposalOneDay/);
assert.match(actions, /dismissCaptureReviewProposal/);

assert.match(reviewLib, /ANTHROPIC_INBOX_ROUTER_MODEL/);
assert.match(reviewLib, /Never create projects here/);
assert.doesNotMatch(reviewLib, /createTask/);
assert.doesNotMatch(reviewLib, /prisma\.capture\.update/);

console.log("capture review proposal contracts passed");
