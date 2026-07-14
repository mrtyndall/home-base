import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeParentDestination,
  resolveVerifiedDestination,
} from "../src/lib/destinations";

const runtimeFiles = [
  "src/lib/tasks.ts",
  "src/lib/capture/service.ts",
  "src/lib/capture/review-proposals.ts",
  "src/lib/task-filter-options.ts",
  "src/lib/home-attention.ts",
  "src/lib/chat.ts",
  "src/app/api/v1/[...path]/route.ts",
  "src/app/api/capture/options/route.ts",
  "src/app/api/tasks/[taskId]/assignment/route.ts",
  "src/app/actions.ts",
  "src/app/review-actions.ts",
] as const;

const source = runtimeFiles
  .map((file) => `${file}\n${readFileSync(file, "utf8")}`)
  .join("\n");

assert.doesNotMatch(source, /area_inbox/, "runtime must not use the retired Inbox Area");
assert.doesNotMatch(source, /\bdomainId\b/, "runtime DTOs and queries must not expose Domain IDs");
assert.doesNotMatch(source, /(?:resource\s*===\s*["']domains["']|\/domains\/)/, "Domain API paths must be removed");
assert.doesNotMatch(source, /getDefaultAreaId|getInboxAreaId/, "eligible writes must not invent a default Area");

type FakeClient = {
  area: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
  project: {
    findFirst: (args: unknown) => Promise<{ id: string; areaId: string | null } | null>;
  };
};

const client: FakeClient = {
  area: {
    findFirst: async () => ({ id: "area-1" }),
  },
  project: {
    findFirst: async () => ({ id: "project-1", areaId: "area-1" }),
  },
};

async function verifyDestinationContract() {
  assert.deepEqual(
    normalizeParentDestination({ parentType: "area", parentId: "area-1" }),
    { areaId: "area-1", projectId: null },
  );
  assert.deepEqual(
    normalizeParentDestination({ projectId: "project-1" }),
    { areaId: null, projectId: "project-1" },
  );
  assert.throws(
    () => normalizeParentDestination({ parentType: "area" }),
    /provided together/,
  );
  assert.throws(
    () =>
      normalizeParentDestination({
        parentType: "area",
        parentId: "area-1",
        projectId: "project-1",
      }),
    /Conflicting destination fields/,
  );
  assert.deepEqual(await resolveVerifiedDestination({}, client), {
    areaId: null,
    projectId: null,
  });
  assert.deepEqual(
    await resolveVerifiedDestination(
      { areaId: "area-1", projectId: "project-1" },
      client,
    ),
    { areaId: "area-1", projectId: "project-1" },
  );
  await assert.rejects(
    resolveVerifiedDestination(
      { areaId: "area-2", projectId: "project-1" },
      client,
    ),
    /Project does not belong to the selected Area/,
  );
  await assert.rejects(
    resolveVerifiedDestination(
      { areaId: "missing-area" },
      {
        area: { findFirst: async () => null },
        project: client.project,
      },
    ),
    /Area not found/,
  );
  await assert.rejects(
    resolveVerifiedDestination(
      { areaId: "area-1", projectId: "missing-project" },
      {
        area: client.area,
        project: { findFirst: async () => null },
      },
    ),
    /Project not found/,
  );
}

const taskSource = readFileSync("src/lib/tasks.ts", "utf8");
assert.match(taskSource, /areaId\?: string \| null/, "task creation must accept an unfiled destination");

const captureSource = readFileSync("src/lib/capture/service.ts", "utf8");
assert.doesNotMatch(
  captureSource,
  /Project captures require an Area/,
  "capture Project creation must allow an omitted Area",
);
assert.match(
  captureSource,
  /Project saved to \$\{project\.area\?\.name \?\? "Unfiled"\}/,
  "capture-created Projects must report an unfiled destination when no Area was named",
);
assert.match(
  captureSource,
  /resolveVerifiedDestination\(\{[\s\S]{0,100}areaId,[\s\S]{0,100}projectId: project\?\.id/,
  "Project selection must let the shared resolver derive the mirrored Area",
);
assert.match(
  captureSource,
  /pg_advisory_xact_lock\(hashtextextended\([^,]+,\s*0\)\)/,
  "idempotent capture processing must acquire a transaction-scoped database lock",
);
assert.doesNotMatch(captureSource, /pg_advisory_xact_lock\(hashtext\(/,
  "capture locks must not use collision-prone 32-bit hashtext keys");
assert.match(
  captureSource,
  /\$transaction[\s\S]*executeActions[\s\S]*capture\.update/,
  "capture side effects and final state must share one transaction",
);
assert.ok(
  captureSource.indexOf("validateCaptureActor") < captureSource.indexOf("capture.create"),
  "untrusted API audit identity must be rejected before any Capture row write",
);
assert.match(
  captureSource,
  /captureAreaId \|\| parsedInput\.captureProjectId[\s\S]{0,80}throw error/,
  "explicit invalid capture destinations must reject instead of becoming unfiled",
);
assert.doesNotMatch(
  captureSource.slice(captureSource.indexOf("async function executeActions")),
  /\bprisma\./,
  "capture execution helpers must use the transaction client, not the global client",
);
assert.match(
  captureSource,
  /resolveVerifiedDestination\([\s\S]{0,180}client/,
  "capture destinations must be verified through the shared resolver with the transaction client",
);

const actionsSource = readFileSync("src/app/actions.ts", "utf8");
const conversionSource = actionsSource.slice(
  actionsSource.indexOf("export async function convertPendingCapture"),
  actionsSource.indexOf("export async function snoozeCaptureReviewProposalOneDay"),
);
assert.match(conversionSource, /\$transaction/,
  "manual capture conversion must be atomic");
assert.match(conversionSource, /pg_advisory_xact_lock\(hashtextextended\([^,]+,\s*0\)\)/,
  "manual capture conversion must lock the Capture row across retries");
assert.match(
  conversionSource,
  /scheduledReview\.findFirst\([\s\S]{0,180}captureId:\s*capture\.id/,
  "manual conversion must scope a review lookup to the current Capture",
);
assert.doesNotMatch(
  conversionSource.replace("prisma.$transaction", "transaction"),
  /\bprisma\./,
  "manual conversion side effects must all use the locked transaction client",
);
assert.match(actionsSource, /if \(note\.parentType && note\.parentId\)/,
  "unfiled notes must not revalidate a null Project path");
assert.match(actionsSource, /if \(projectId && !project\) return/,
  "quick Task action must reject an explicitly invalid Project");
assert.match(actionsSource, /if \(selectedAreaId && !project && !area\) return/,
  "quick Task action must reject an explicitly invalid Area");
assert.match(source, /Conflicting destination fields/,
  "parent aliases must reject conflicting destinations");

const quickTaskSource = readFileSync("src/app/api/tasks/quick/route.ts", "utf8");
assert.match(quickTaskSource, /if \(projectId && !project\)/,
  "quick Task API must reject an explicitly invalid Project");
assert.match(quickTaskSource, /if \([^)]*areaId[^)]*&&[^)]*!area/,
  "quick Task API must reject an explicitly invalid Area");

const apiSource = readFileSync("src/app/api/v1/[...path]/route.ts", "utf8");
assert.match(
  apiSource,
  /async function resolveAreaReference[\s\S]*Area not found/,
  "supplied-but-unresolved Area names must be rejected",
);
assert.doesNotMatch(apiSource, /const nextAreaId = areaId \?\? existing\.areaId/,
  "an unresolved Project patch Area name must not preserve the existing Area",
);

const idempotencyIntegrationSource = readFileSync(
  "scripts/area-first-idempotency.integration.ts",
  "utf8",
);
assert.match(
  idempotencyIntegrationSource,
  /CREATE TRIGGER[\s\S]*AFTER INSERT[\s\S]*ON tasks/i,
  "the disposable integration must block after the target Task insert",
);
assert.match(
  idempotencyIntegrationSource,
  /pg_stat_activity[\s\S]*wait_event[\s\S]*advisory/i,
  "the disposable integration must observe both advisory-lock waiters",
);
assert.match(
  idempotencyIntegrationSource,
  /RAISE EXCEPTION[\s\S]*rollback probe/i,
  "the disposable integration must force failure after Task insertion",
);

void verifyDestinationContract();
