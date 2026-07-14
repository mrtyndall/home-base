import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveVerifiedDestination } from "../src/lib/destinations";

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
    findFirst: (args: unknown) => Promise<{ id: string; areaId: string } | null>;
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
}

const taskSource = readFileSync("src/lib/tasks.ts", "utf8");
assert.match(taskSource, /areaId\?: string \| null/, "task creation must accept an unfiled destination");

const captureSource = readFileSync("src/lib/capture/service.ts", "utf8");
assert.match(captureSource, /Project captures require an Area/, "capture Project creation must remain Area-required");
assert.match(captureSource, /project\?\.areaId/, "Project selection must derive the mirrored Area");

void verifyDestinationContract();
