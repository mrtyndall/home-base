# Area-First Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Domains, make Areas the flat top-level workspace, make Inbox a valid global unfiled state, add Area/Project creation, and deploy the coordinated change safely to Railway.

**Architecture:** Use a two-release expand/contract migration. Release A makes destinations nullable, detaches the former Inbox Area, switches every runtime surface to the Area-first model, and preserves API compatibility where needed. Release B removes the now-unused Domain and system-Inbox database structures only after production verification.

**Tech Stack:** Next.js 16 App Router and Server Actions, React 19, TypeScript 5, Prisma 7/PostgreSQL, Zod 4, Swift 6/XcodeGen, Railway Docker deployment.

## Global Constraints

- Capture now; organize later. A destination is never required for eligible Inbox content.
- Areas are flat; no sub-areas.
- Every Project belongs to exactly one Area; no nested Projects.
- Books and Movies stay global and must retain identical records through migration.
- People stay global with an optional link to one Area and do not appear in Inbox merely because the link is absent.
- Notes, Documents, Ideas, and References can attach to an Area or Project or remain unfiled.
- AI suggestions never block creation and never invent an Area for a Project.
- Never hard-delete user content; only obsolete Domain and `area_inbox` taxonomy rows may be removed after verified detachment.
- Do not deploy from a dirty tree. Each Railway upload must come from a clean worktree at an exact commit.
- Do not claim deployment success until Railway reports `SUCCESS`, migrations are confirmed in logs, and external production smoke tests show commit-specific content.
- The owner has accepted an open interim Railway deployment. Cloudflare Access and removal/blocking of the direct Railway-domain bypass are a documented follow-up, not part of this release.

---

### Task 1: Establish the Test Gate and Destination Contract

**Files:**
- Create: `src/lib/destinations.ts`
- Create: `scripts/area-first-destination-contract.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeDestination(input)`, `destinationKind(input)`, and `DestinationInput` for shared web/API/capture validation.
- Produces: `npm test` as the deterministic repository test command.

- [ ] **Step 1: Write the failing destination contract test**

```ts
import assert from "node:assert/strict";
import { destinationKind, normalizeDestination } from "../src/lib/destinations";

assert.equal(destinationKind({}), "inbox");
assert.deepEqual(normalizeDestination({ areaId: " area-1 ", projectId: "" }), {
  areaId: "area-1",
  projectId: null,
});
assert.equal(destinationKind({ areaId: "area-1" }), "area");
assert.equal(destinationKind({ areaId: "area-1", projectId: "project-1" }), "project");
assert.throws(
  () => normalizeDestination({ projectId: "project-1" }),
  /Project destinations require an Area/,
);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx scripts/area-first-destination-contract.test.ts`  
Expected: FAIL because `src/lib/destinations.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure contract**

```ts
export type DestinationInput = {
  areaId?: string | null;
  projectId?: string | null;
};

export function normalizeDestination(input: DestinationInput) {
  const areaId = input.areaId?.trim() || null;
  const projectId = input.projectId?.trim() || null;
  if (projectId && !areaId) {
    throw new Error("Project destinations require an Area.");
  }
  return { areaId, projectId };
}

export function destinationKind(input: DestinationInput) {
  const destination = normalizeDestination(input);
  if (destination.projectId) return "project" as const;
  if (destination.areaId) return "area" as const;
  return "inbox" as const;
}
```

- [ ] **Step 4: Add and verify the unified test command**

Add `"test": "tsx --test scripts/*.test.ts"` to `package.json`.

Run: `npm test`  
Expected: the new contract passes; fix the known brittle `Choose area` source-string assertion to match behavior so all repository tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json src/lib/destinations.ts scripts/area-first-destination-contract.test.ts scripts/capture-file-confirmation.test.ts
git commit -m "test: establish area-first destination contract"
```

---

### Task 2: Expand the Database for a Global Inbox

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713235900_area_first_expand/migration.sql`
- Create: `scripts/verify-area-first-migration.ts`
- Create: `scripts/area-first-schema.test.ts`

**Interfaces:**
- Consumes: `DestinationInput` semantics from Task 1.
- Produces: nullable organizational relationships while retaining obsolete Domain columns/tables physically for the expand release.
- Produces: `npm run verify:area-migration` for count/invariant verification.

- [ ] **Step 1: Write a failing schema contract test**

Assert the Prisma schema has no `Domain` model or `Area.domainId`, `Task.areaId` is nullable with no `area_inbox` default, eligible polymorphic parent fields are nullable, and `Project.areaId` remains required.

Run: `npx tsx scripts/area-first-schema.test.ts`  
Expected: FAIL on the current Domain model and required/defaulted Task Area.

- [ ] **Step 2: Write the expand migration with explicit guards**

The SQL must:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM projects WHERE area_id = 'area_inbox') THEN
    RAISE EXCEPTION 'Cannot detach Inbox: projects still reference area_inbox';
  END IF;
END $$;

ALTER TABLE tasks ALTER COLUMN area_id DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN area_id DROP NOT NULL;
UPDATE tasks SET area_id = NULL WHERE area_id = 'area_inbox';
UPDATE routines SET area_id = NULL WHERE area_id = 'area_inbox';
UPDATE ideas SET area_id = NULL WHERE area_id = 'area_inbox';
UPDATE references SET area_id = NULL WHERE area_id = 'area_inbox';
UPDATE people SET area_id = NULL WHERE area_id = 'area_inbox';
UPDATE capture_review_proposals SET suggested_area_id = NULL
WHERE suggested_area_id = 'area_inbox';

ALTER TABLE entity_notes ALTER COLUMN parent_type DROP NOT NULL;
ALTER TABLE entity_notes ALTER COLUMN parent_id DROP NOT NULL;
ALTER TABLE entity_docs ALTER COLUMN parent_type DROP NOT NULL;
ALTER TABLE entity_docs ALTER COLUMN parent_id DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN parent_type DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN parent_id DROP NOT NULL;

UPDATE entity_notes SET parent_type = NULL, parent_id = NULL
WHERE parent_type = 'area' AND parent_id = 'area_inbox';
UPDATE entity_docs SET parent_type = NULL, parent_id = NULL
WHERE parent_type = 'area' AND parent_id = 'area_inbox';
UPDATE documents SET parent_type = NULL, parent_id = NULL
WHERE parent_type = 'area' AND parent_id = 'area_inbox';

ALTER TABLE entity_notes ADD CONSTRAINT entity_notes_parent_pair_check
CHECK ((parent_type IS NULL) = (parent_id IS NULL));
ALTER TABLE entity_docs ADD CONSTRAINT entity_docs_parent_pair_check
CHECK ((parent_type IS NULL) = (parent_id IS NULL));
ALTER TABLE documents ADD CONSTRAINT documents_parent_pair_check
CHECK ((parent_type IS NULL) = (parent_id IS NULL));
```

Do not drop Domain structures in this migration.

- [ ] **Step 3: Update the Prisma application model**

Remove `Domain`, `Area.domainId`, and the Domain relation from `schema.prisma`; make eligible parent and Area relationships nullable; retain `Project.areaId` as required. The generated client ignores the obsolete physical Domain columns during the expand release.

- [ ] **Step 4: Add migration verification**

`verify-area-first-migration.ts` must query aggregate counts only and fail unless:

- no Project references `area_inbox`;
- no eligible content references `area_inbox` after migration;
- no Task with `projectId` has a mismatched or absent mirrored Area;
- every Project has an Area;
- Book and Movie counts match supplied pre-migration expectations.

- [ ] **Step 5: Verify on a disposable restored database**

Create a local disposable database, restore the latest production backup into it, run `prisma migrate deploy`, then run the verifier. Never point these commands at production.

Expected: migration and verifier exit 0; Book/Movie counts remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations scripts/verify-area-first-migration.ts scripts/area-first-schema.test.ts package.json
git commit -m "feat: expand schema for global inbox"
```

---

### Task 3: Replace Domain and Inbox-Area Runtime Assumptions

**Files:**
- Create: `src/lib/areas.ts`
- Modify: `src/lib/tasks.ts`
- Modify: `src/lib/capture/service.ts`
- Modify: `src/lib/capture/review-proposals.ts`
- Modify: `src/lib/task-filter-options.ts`
- Modify: `src/lib/home-attention.ts`
- Modify: `src/lib/chat.ts`
- Delete: `src/lib/domains.ts`
- Modify: `src/app/api/v1/[...path]/route.ts`
- Modify: `src/app/api/capture/options/route.ts`
- Modify: `src/app/api/tasks/[taskId]/assignment/route.ts`
- Modify: `src/app/actions.ts`
- Modify: `src/app/review-actions.ts`
- Test: `scripts/area-first-runtime.test.ts`
- Test: existing capture/task/API contract scripts

**Interfaces:**
- Produces: `getAreaAggregate(areaId)` replacing `getDomainAggregate`.
- Produces: shared `resolveVerifiedDestination()` that checks Project/Area consistency before writes.
- Preserves: bearer API access for iOS/MCP while removing Domain response fields.

- [ ] **Step 1: Write failing runtime contract tests**

Tests must prove source no longer contains `area_inbox`, `domainId`, Domain API paths, or default-Area fallback; unfiled task creation is accepted; Project creation still rejects missing Area; and Project selection derives its Area.

Run: `npx tsx scripts/area-first-runtime.test.ts`  
Expected: FAIL on current Domain and Inbox assumptions.

- [ ] **Step 2: Implement verified destination resolution**

```ts
export async function resolveVerifiedDestination(
  input: DestinationInput,
  client = prisma,
) {
  const destination = normalizeDestination(input);
  if (!destination.projectId) {
    if (!destination.areaId) return destination;
    const area = await client.area.findFirst({
      where: { id: destination.areaId, status: "active" },
      select: { id: true },
    });
    if (!area) throw new Error("Area not found.");
    return destination;
  }
  const project = await client.project.findFirst({
    where: { id: destination.projectId },
    select: { id: true, areaId: true },
  });
  if (!project || project.areaId !== destination.areaId) {
    throw new Error("Project does not belong to the selected Area.");
  }
  return destination;
}
```

- [ ] **Step 3: Route all eligible mutations through the shared resolver**

Task, Idea, Reference, Note, Entity Doc, Document, and capture-conversion writes must accept null destinations. Project writes must validate an active Area. Moving a Project between Areas updates mirrored child Area IDs in one transaction.

- [ ] **Step 4: Replace Domain aggregates and filters**

Use direct Area lists ordered by `sortOrder`, then `name`. Remove Domain endpoints, labels, DTO fields, filter grouping, chat facts, and search assumptions. Do not remove Area or Project search results.

- [ ] **Step 5: Make capture routing low-friction and idempotent**

Remove the default-Area resolver. Clear recognized eligible content may be created unfiled. Ambiguous captures remain pending. Project capture remains pending unless an Area is identified. Add a stable idempotency key path for client retries and reject untrusted client audit identity.

- [ ] **Step 6: Run focused tests and full test gate**

Run: `npx tsx scripts/area-first-runtime.test.ts`  
Run: `npm test`  
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src scripts
git commit -m "refactor: make areas the primary taxonomy"
```

---

### Task 4: Build the Area-First Web Experience

**Files:**
- Create: `src/app/areas/new/page.tsx`
- Modify: `src/app/areas/[areaId]/page.tsx`
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/projects/new/page.tsx`
- Delete: `src/app/domains/[domainId]/page.tsx`
- Modify: `src/app/tasks/page.tsx`
- Modify: `src/app/today/page.tsx`
- Modify: `src/components/capture-file-actions.tsx`
- Modify: `src/components/nav-tabs.tsx`
- Modify: `src/app/page.tsx`
- Test: `scripts/area-creation-ui.test.ts`
- Test: `scripts/project-area-creation-ui.test.ts`
- Test: `scripts/global-inbox-ui.test.ts`

**Interfaces:**
- Consumes: `createArea`, `createProject`, and nullable destination actions from Task 3.
- Produces: `New area`, Area-scoped `New project`, and global Inbox UI.

- [ ] **Step 1: Write failing UI behavior tests**

Tests must assert:

- Areas index exposes `New area` and `New project`;
- empty state exposes `Create your first area`;
- Area form requires only `name`;
- Area page links to `/projects/new?areaId=<id>`;
- Project form locks a valid query-supplied Area and otherwise requires Area selection;
- Inbox renders unfiled eligible content without warning/error copy;
- no Domain navigation or labels remain.

Run the three new test files and verify they fail on the current UI.

- [ ] **Step 2: Implement `createArea` and the New Area page**

```ts
export async function createArea(formData: FormData) {
  const name = getTrimmedString(formData, "name");
  if (!name) return;
  const last = await prisma.area.aggregate({ _max: { sortOrder: true } });
  const area = await prisma.area.create({
    data: { name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
  revalidatePath("/projects");
  redirect(`/areas/${area.id}`);
}
```

The page keeps the current restrained Home Base visual language. Its signature element is the Area name itself: one calm, focused field with plain copy explaining that Areas are ongoing parts of life. Do not introduce a new palette or generic dashboard decoration.

- [ ] **Step 3: Rework the Areas index and empty state**

Keep Area cards dominant. Rename user-facing navigation to `Areas`; retain `/projects` as the compatibility index route for Release A. Add a useful empty state, not a blank shelf.

- [ ] **Step 4: Add Area-scoped Project creation**

On the Area page, `New project` supplies `areaId`. On the form, validate the query Area server-side; render it as fixed context rather than an editable selector. Global creation retains an Area selector and directs to Area creation if none exist.

- [ ] **Step 5: Build the global Inbox view**

Show pending captures and unfiled eligible content together, grouped by recognizable type. Filing controls are optional actions. Empty copy says the Inbox is clear; nonempty copy never frames unfiled items as errors.

- [ ] **Step 6: Browser QA**

Use the in-app browser to verify desktop and narrow layouts, keyboard focus, empty state, Area creation, Project creation within an Area, and Inbox behavior against a disposable/local database.

- [ ] **Step 7: Run tests and commit**

Run: `npm test && npm run lint && npm run build`  
Expected: all exit 0.

```bash
git add src scripts
git commit -m "feat: add area-first creation flows"
```

---

### Task 5: Coordinate Native iOS Contracts

**Files:**
- Modify in iOS worktree: `ios/HomeBaseKit/Sources/HomeBaseKit/API.swift`
- Modify in iOS worktree: `ios/HomeBaseKit/Sources/HomeBaseKit/NativeModels.swift`
- Modify in iOS worktree: `ios/HomeBase/App/HomeBaseAppModel.swift`
- Modify in iOS worktree: `ios/HomeBase/App/Views/ProjectsView.swift`
- Modify in iOS worktree: `ios/HomeBaseKit/Sources/HomeBaseKit/CaptureDraftQueue.swift`
- Test: `ios/HomeBaseKit/Tests/HomeBaseKitTests/APIClientTests.swift`
- Test: native contract test files

**Interfaces:**
- Consumes: Release A API DTOs from Task 3.
- Produces: destination-free offline captures with stable idempotency IDs and Area-first pickers.

- [ ] **Step 1: Rebase or merge current main into the paused iOS branch without discarding its existing work**

Record the dirty-worktree fingerprint first. Resolve the deleted widget endpoint and Today DTO differences explicitly; do not overwrite user changes.

- [ ] **Step 2: Write failing native contract tests**

Cover null destination decoding/encoding, removal of Domain fields, Project requiring Area, global Inbox presentation, and the stable capture draft UUID sent as an idempotency key.

- [ ] **Step 3: Update models, API client, and views**

Remove Domain types and group directly by Area. Keep People global with optional Area. Keep Books/Movies global. Make eligible destination fields optional. Serialize capture queue drains and send the stable draft UUID.

- [ ] **Step 4: Run native verification**

Run:

```bash
swift test --package-path ios/HomeBaseKit
bash scripts/ios-test.sh
xcodebuild -project ios/HomeBase.xcodeproj -scheme HomeBase -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build-for-testing
```

Expected: all exit 0. Keep build artifacts outside the source worktree where supported.

- [ ] **Step 5: Commit on the iOS branch**

```bash
git add ios docs/ios-native-app.md scripts/ios-test.sh
git commit -m "feat: align ios with area-first taxonomy"
```

---

### Task 6: Release A — Expand and Cut Over

**Files:**
- Modify: `scripts/seed-runtime.mjs`
- Modify: `prisma/seed.ts`
- Modify: `Dockerfile`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `AGENTS.md`
- Create: `scripts/verify-area-first-release.ts`

**Interfaces:**
- Produces: an app that runs without Domain or `area_inbox` runtime dependencies while obsolete DB structures remain temporarily for rollback safety.

- [ ] **Step 1: Remove runtime reseeding of mutable taxonomy and settings**

Startup must run migrations and insert-only immutable bootstrap rows. It must not recreate Domain, Inbox Area, or overwrite preferences/Area state.

- [ ] **Step 2: Pin production migration tooling**

Replace the unlocked runner-stage `npm install prisma dotenv` with lockfile-pinned packages copied or installed through `npm ci`.

- [ ] **Step 3: Run the complete local verification gate**

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npx prisma validate
npm run build
git diff --check
```

Expected: every command exits 0 and the worktree is clean after committing.

- [ ] **Step 4: Commit the verified Release A code**

```bash
git add Dockerfile scripts prisma README.md ARCHITECTURE.md AGENTS.md
git commit -m "ops: prepare area-first production rollout"
git status --short
```

Expected: the commit succeeds and `git status --short` prints nothing.

- [ ] **Step 5: Back up and record production invariants**

Create a fresh Railway database backup using the existing safe backup workflow. Record only aggregate counts and backup path/checksum metadata; do not expose user data or connection strings.

- [ ] **Step 6: Deploy Release A from the clean exact commit**

```bash
RAILWAY_CALLER=skill:use-railway@1.3.5 \
RAILWAY_AGENT_SESSION=homebase-area-first-20260713 \
railway up --project 293a006f-f2d5-408d-abcb-8de2218be25f \
  --environment 4bea8124-cb21-4c56-83d3-7105aed019ff \
  --service 1dc07615-ae44-4dd1-b95b-6d85bac7a07b \
  --detach -m "Area-first taxonomy expand release"
```

- [ ] **Step 7: Verify Release A**

Poll the explicitly scoped deployment until `SUCCESS`. Confirm logs show the expand migration. Externally verify the Areas UI contains `New area`, bearer API still rejects missing/invalid keys, and aggregate Book/Movie counts are unchanged. Record that the Railway origin is intentionally open pending Cloudflare Access.

- [ ] **Step 8: Update the local Railway-backed runtime**

Build the exact release commit and restart the Home Base and MCP LaunchAgents. Verify `127.0.0.1:3002` and the tailnet origin show the Area-first marker.

---

### Task 7: Release B — Contract Cleanup

**Files:**
- Create: `prisma/migrations/20260714010000_area_first_contract/migration.sql`
- Modify: migration verifier and schema contract tests

**Interfaces:**
- Consumes: verified Release A production state.
- Produces: final database without Domain or system Inbox Area structures.

- [ ] **Step 1: Re-run production preflight after Release A soak**

Abort unless obsolete Domain/Inbox structures have no remaining runtime dependents, no Project references `area_inbox`, eligible content references are detached, and library counts match the pre-release snapshot.

- [ ] **Step 2: Write the cleanup migration**

```sql
DELETE FROM areas WHERE id = 'area_inbox';
ALTER TABLE areas DROP CONSTRAINT IF EXISTS areas_domain_id_fkey;
DROP INDEX IF EXISTS areas_domain_id_status_sort_order_idx;
ALTER TABLE areas DROP COLUMN domain_id;
ALTER TABLE areas DROP COLUMN is_system;
DROP TABLE domains;
```

Use the actual constraint/index names from the database catalog and guard every destructive statement with verified dependency checks.

- [ ] **Step 3: Verify the migration on a disposable Release A database**

Run migrations, verifier, full tests, lint, TypeScript, Prisma validation, and build. Verify Book/Movie records and all non-taxonomy counts.

- [ ] **Step 4: Commit and deploy Release B**

```bash
git add prisma scripts
git commit -m "refactor: remove obsolete domain schema"
```

Deploy from the clean exact commit with message `Area-first taxonomy contract release`.

- [ ] **Step 5: Verify production terminal state**

Require Railway `SUCCESS`, clean migration logs, external authenticated Area/Project/Inbox smoke tests, API smoke tests, unchanged library aggregates, bounded error-log inspection, and commit-specific content fingerprint.

- [ ] **Step 6: Push GitHub and update the work log**

Push the reviewed commits to the private GitHub repository using the GitHub workflow. Update the Home Base work log with outcomes, decisions, verification, deployment IDs/status, next steps, and any residual iOS device-testing gaps.

---

## Final Review Gate

Before declaring completion:

1. Review every acceptance criterion in the design spec against code and tests.
2. Run a whole-branch code review with particular attention to migration rollback safety, cross-Area consistency, capture idempotency, bearer/capture endpoint hardening, and iOS/API compatibility.
3. Fix all Critical and Important findings and re-review.
4. Run the full fresh verification suite again.
5. Confirm Railway production is `SUCCESS` and paste the raw external production curl status/redirect output in the handoff without including protected content or secrets.
