import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("src/app/actions.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260714150000_codex_workers/migration.sql",
  "utf8",
);

function actionBody(start: string, end: string) {
  return actions.slice(actions.indexOf(start), actions.indexOf(end));
}

test("proposal resolution and snoozing serialize on one database advisory lock", () => {
  assert.match(
    actions,
    /function lockCaptureReviewProposal[\s\S]*pg_advisory_xact_lock\(hashtextextended/,
  );

  const accept = actionBody(
    "export async function convertPendingCapture",
    "export async function snoozeCaptureReviewProposalOneDay",
  );
  const snooze = actionBody(
    "export async function snoozeCaptureReviewProposalOneDay",
    "export async function dismissCaptureReviewProposal",
  );
  const dismiss = actionBody(
    "export async function dismissCaptureReviewProposal",
    "export async function createEntityDoc",
  );

  for (const body of [accept, snooze, dismiss]) {
    assert.match(body, /lockCaptureReviewProposal\(/);
    assert.match(body, /status:\s*\{\s*in:\s*\["pending",\s*"snoozed"\]\s*\}/);
    assert.match(body, /captureReviewProposal\.updateMany\(/);
  }
  assert.ok(
    accept.indexOf("captureReviewProposal.updateMany(") <
      accept.indexOf("let item: CreatedItemRef"),
    "acceptance must claim the pending proposal before creating a destination entity",
  );
});

test("routing feedback is one immutable outcome per proposal", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "capture_routing_feedback_proposal_id_key"[\s\S]*\("proposal_id"\)/,
  );
  assert.match(
    migration,
    /capture_routing_feedback_proposal_id_fkey[\s\S]*FOREIGN KEY \("proposal_id"\) REFERENCES "capture_review_proposals"\("id"\) ON DELETE RESTRICT/,
  );
  assert.match(schema, /proposalId\s+String\?\s+@unique\s+@map\("proposal_id"\)/);
  assert.match(
    schema,
    /proposal\s+CaptureReviewProposal\?\s+@relation\(fields:\s*\[proposalId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict,\s*onUpdate:\s*Cascade\)/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER prevent_capture_routing_feedback_update BEFORE UPDATE ON "capture_routing_feedback"/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION prevent_capture_routing_feedback_update\(\)[\s\S]*RAISE EXCEPTION/,
  );
});
