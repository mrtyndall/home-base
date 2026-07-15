import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  normalizeSorterProposal,
  toRoutingExampleText,
} from "../src/lib/agent/sorter";

const areaId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";

test("sorter drops invented destinations and derives a valid project area", () => {
  const normalized = normalizeSorterProposal(
    {
      disposition: "proposal",
      targetType: "task",
      areaId: "33333333-3333-4333-8333-333333333333",
      projectId,
      confidence: 0.9,
      reason: "A clear task for this project.",
    },
    [{ id: areaId }],
    [{ id: projectId, areaId }],
  );

  assert.equal(normalized.projectId, projectId);
  assert.equal(normalized.areaId, areaId);
});

test("sorter cannot preserve an unknown project id", () => {
  const normalized = normalizeSorterProposal(
    {
      disposition: "proposal",
      targetType: "reference",
      areaId: null,
      projectId: "33333333-3333-4333-8333-333333333333",
      confidence: 0.7,
      reason: "External material.",
    },
    [{ id: areaId }],
    [{ id: projectId, areaId }],
  );

  assert.equal(normalized.projectId, null);
  assert.equal(normalized.areaId, null);
});

test("capture source is persisted before the remote parser and unresolved work is queued", () => {
  const service = readFileSync(
    join(process.cwd(), "src/lib/capture/service.ts"),
    "utf8",
  );
  const persistIndex = service.indexOf("ensureCaptureSourceExists(");
  const parseIndex = service.indexOf("await parseCaptureWithContext");
  assert.ok(persistIndex >= 0, "capture source persistence boundary is missing");
  assert.ok(persistIndex < parseIndex, "remote parse occurs before source persistence");
  assert.match(service, /enqueueAgentJob\([\s\S]*kind:\s*"capture_sort"/);
  const flagGuard = service.indexOf('isAgentWorkerEnabled("sorter") &&');
  assert.ok(
    flagGuard >= 0 && flagGuard < service.indexOf("await enqueueAgentJob(", flagGuard),
    "disabled sorter mode must be checked before capture enqueue",
  );
});

test("sorter backfill and proposal application exclude captures still being parsed", () => {
  const sorter = readFileSync(
    join(process.cwd(), "src/lib/agent/sorter.ts"),
    "utf8",
  );
  const backfill = sorter.indexOf("export async function enqueueUnresolvedCaptureJobs");
  const flagGuard = sorter.indexOf('if (!isAgentWorkerEnabled("sorter"))', backfill);
  assert.ok(
    flagGuard >= 0 && flagGuard < sorter.indexOf("prisma.capture.findMany", backfill),
    "disabled sorter mode must be checked before backfill enqueue work",
  );
  assert.doesNotMatch(sorter, /parseStatus:\s*null/);
  assert.match(sorter, /parseStatus:\s*\{\s*in:\s*\["ambiguous",\s*"failed"\]\s*\}/);
});

test("reviewed routing examples are bounded before schema validation", () => {
  assert.equal(toRoutingExampleText("   "), null);
  const text = toRoutingExampleText(`  ${"x".repeat(2_500)}  `);
  assert.equal(text?.length, 2_000);
});
