# Nested Areas and Unfiled Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Areas nest to unlimited depth and let Projects be created, used, filed, moved, or unfiled without requiring an Area.

**Architecture:** Add a nullable self-relation to `Area` and make `Project.areaId` nullable. Centralize tree traversal, cycle validation, path labels, and atomic Project filing in `src/lib/hierarchy.ts`; all web, capture, REST, and MCP mutations use that boundary.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma, PostgreSQL, Vitest, Tailwind CSS.

## Global Constraints

- Existing Areas become roots and existing Projects retain their current Areas.
- Hierarchy depth is unlimited; self-parenting and cycles are rejected.
- Project creation requires only a name; filing remains optional.
- Directly Project-linked Tasks, Ideas, and References mirror the Project Area atomically, including clearing on unfile.
- Books and Movies remain global.
- No delete API or destructive migration.

---

### Task 1: Hierarchy schema and pure tree helpers

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260714090000_nested_areas_unfiled_projects/migration.sql`
- Create: `src/lib/hierarchy.ts`
- Create: `src/lib/hierarchy.test.ts`

**Interfaces:**
- Produces: `AreaTreeNode`, `AreaOption`, `buildAreaTree(areas)`, `flattenAreaOptions(areas)`, `assertValidAreaParent(areaId, parentAreaId, client)`.

- [ ] **Step 1: Write failing helper tests**

Cover root/child/grandchild ordering, `Hobbies / Ham Radio` paths, orphan-safe flattening, self-parent rejection, and descendant-parent cycle rejection.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npx vitest run src/lib/hierarchy.test.ts`

Expected: FAIL because `src/lib/hierarchy.ts` does not exist.

- [ ] **Step 3: Add the schema and migration**

Add the self-relation and optional Project relation:

```prisma
model Area {
  parentAreaId String? @map("parent_area_id")
  parentArea   Area?   @relation("AreaHierarchy", fields: [parentAreaId], references: [id], onDelete: Restrict)
  childAreas   Area[]  @relation("AreaHierarchy")
  @@index([parentAreaId, status, sortOrder])
}

model Project {
  areaId String? @map("area_id")
  area   Area?   @relation(fields: [areaId], references: [id])
}
```

The SQL migration adds `areas.parent_area_id`, its index and foreign key, then drops/recreates the Project Area foreign key after removing `NOT NULL`. It does not update or delete data.

- [ ] **Step 4: Implement tree and cycle helpers**

Use iterative maps/sets rather than recursive database queries. `assertValidAreaParent` walks the proposed parent's ancestors and throws `HierarchyValidationError` with stable codes `self_parent`, `cycle`, or `parent_not_found`.

- [ ] **Step 5: Verify schema and tests**

Run: `npx prisma validate && npx vitest run src/lib/hierarchy.test.ts`

Expected: Prisma valid and all hierarchy tests PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260714090000_nested_areas_unfiled_projects src/lib/hierarchy.ts src/lib/hierarchy.test.ts
git commit -m "feat: add nested area hierarchy"
```

### Task 2: Atomic Project filing and destination validation

**Files:**
- Modify: `src/lib/hierarchy.ts`
- Modify: `src/lib/destinations.ts`
- Modify: `src/lib/tasks.ts`
- Modify: `src/lib/capture/service.ts`
- Create: `src/lib/project-filing.test.ts`
- Modify: existing destination/capture tests discovered with `rg --files src | rg 'destination|capture.*test'`

**Interfaces:**
- Produces: `fileProject(projectId: string, areaId: string | null, client = prisma): Promise<Project>` and `resolveVerifiedDestination({ areaId?, projectId? })` accepting an unfiled Project.

- [ ] **Step 1: Write failing filing tests**

Cover assigning, moving, and unfiling a Project; mirrored Task/Idea/Reference Area IDs; rollback on invalid Area; and resolving `{ projectId, areaId: null }` when the Project is unfiled.

- [ ] **Step 2: Run focused tests and confirm failures**

Run: `npx vitest run src/lib/project-filing.test.ts src/lib/destinations.test.ts`

Expected: FAIL on required `areaId` and current destination invariant.

- [ ] **Step 3: Implement one transactional filing boundary**

`fileProject` verifies an active, non-system Area when non-null, then in one transaction updates the Project and `updateMany` on Tasks, Ideas, and References whose `projectId` matches. It writes the existing audit notification/activity entry after the relationship change using the same transaction.

- [ ] **Step 4: Update destination resolution**

Project selection becomes authoritative:

```ts
if (projectId) {
  const project = await findProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (areaId && areaId !== project.areaId) throw new Error("Project does not belong to the selected Area.");
  return { projectId, areaId: project.areaId };
}
```

- [ ] **Step 5: Run focused and capture tests**

Run: `npx vitest run src/lib/project-filing.test.ts src/lib/destinations.test.ts src/lib/capture`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hierarchy.ts src/lib/destinations.ts src/lib/tasks.ts src/lib/capture src/lib/*filing*.test.ts
git commit -m "feat: allow unfiled project destinations"
```

### Task 3: Web Area tree and frictionless Project creation

**Files:**
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/projects/new/page.tsx`
- Modify: `src/app/areas/[areaId]/page.tsx`
- Modify: `src/app/projects/[projectId]/page.tsx`
- Modify: `src/app/actions.ts`
- Modify: `src/components/task-quick-assignment.tsx`
- Modify: `src/lib/task-assignment-options.ts`
- Create: `src/components/area-picker.tsx`
- Create: `src/components/area-picker.test.tsx`

**Interfaces:**
- Consumes: `flattenAreaOptions`, `fileProject`, optional `Project.areaId`.
- Produces: reusable `AreaPicker` with `No area yet`, path labels, optional locked/preselected parent, and 44px mobile controls.

- [ ] **Step 1: Write failing UI/helper tests**

Assert path-labelled nested options, global Project creation with blank Area, task assignment to an unfiled Project, breadcrumb text, and cycle destinations excluded from reparenting.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run src/components/area-picker.test.tsx src/lib/task-assignment-options.test.ts`

- [ ] **Step 3: Build the reusable picker and tree presentation**

Render `No area yet` first when nullable, then flattened options using `option.path`. The Areas page renders roots and descendants with depth-limited visual indentation while preserving semantic links and 44px disclosure controls.

- [ ] **Step 4: Make actions optional and transactional**

`createArea` accepts optional `parentAreaId` and validates it. `createProject` no longer returns when `areaId` is empty. Add `updateAreaParent` and `updateProjectArea` server actions that call hierarchy boundaries and revalidate affected Area, Project, Inbox, and index routes.

- [ ] **Step 5: Verify mobile behavior**

Run the app at a 390px viewport and confirm no horizontal overflow on `/projects`, a nested Area detail page, global Project creation, and an unfiled Project detail page.

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run src/components/area-picker.test.tsx src/lib/task-assignment-options.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app src/components/area-picker.tsx src/components/area-picker.test.tsx src/components/task-quick-assignment.tsx src/lib/task-assignment-options.ts
git commit -m "feat: add nested area and unfiled project flows"
```

### Task 4: REST, capture, MCP, and compatibility cleanup

**Files:**
- Modify: `src/app/api/v1/[...path]/route.ts`
- Modify: `src/lib/capture/parser.ts`
- Modify: `src/lib/capture/service.ts`
- Modify: `mcp/http-server.ts`
- Modify: `src/lib/chat.ts`
- Modify: API/MCP/capture contract tests under `src/**/*.test.ts` and `scripts/verify-api-contract.ts`

**Interfaces:**
- Produces: nullable Project Area contracts; Area `parentAreaId` and path; `reparent_area` and `file_project` MCP tools; no active Domain wording.

- [ ] **Step 1: Add failing contract tests**

Test POST Project without Area, PATCH Project Area to ID/null, POST/PATCH Area parent, cycle 400, hierarchy readback, capture-created unfiled Project, and MCP tool schemas.

- [ ] **Step 2: Run contract tests and confirm failure**

Run the exact test files identified by `rg -l 'create_area|create_project|list_areas' src mcp scripts | rg 'test|verify'`.

- [ ] **Step 3: Implement contracts through shared boundaries**

REST returns stable 400 validation bodies for hierarchy errors. MCP tools proxy those endpoints. Parser wording says a Project may be created unfiled and never invents an Area. Rename/remove `read_domain_page`; if kept as an alias, mark it deprecated and make it call Area hierarchy reads.

- [ ] **Step 4: Run API/MCP/capture tests**

Expected: all focused suites PASS and no active tool description says Areas have parent Domains.

- [ ] **Step 5: Commit**

```bash
git add src/app/api src/lib/capture src/lib/chat.ts mcp scripts
git commit -m "feat: expose area hierarchy to agents"
```

### Task 5: Migration integrity and release verification

**Files:**
- Create: `scripts/verify-hierarchy-release.ts`
- Modify: `package.json`
- Modify: `ARCHITECTURE.md`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run verify:hierarchy-release -- --preflight` and strict postflight checks.

- [ ] **Step 1: Implement read-only integrity checks**

Report and fail on Area cycles, orphan parents, orphan Project Areas, or child records whose mirrored Area differs from their Project. Record and compare Book, Movie, Area, Project, and Reference counts.

- [ ] **Step 2: Run preflight against the configured development database**

Expected: a count summary with no writes. Do not run destructive commands against Railway.

- [ ] **Step 3: Update architecture and runtime documentation**

Replace flat-Area/required-Project-Area statements and document the shared hierarchy boundary and migration gates.

- [ ] **Step 4: Run the complete quality gate**

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npx prisma validate
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-hierarchy-release.ts package.json ARCHITECTURE.md README.md
git commit -m "docs: add hierarchy release safeguards"
```
