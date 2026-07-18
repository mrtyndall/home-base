# Capture Dismissal and Area Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add confirmed soft-dismiss controls to review captures, show only top-level Areas on the root index, expose children inside their parent Area, and move HAM Radio under Hobbies.

**Architecture:** Reuse the existing audited `dismissCapture` server action behind a focused client confirmation component. Replace recursive root Area rendering with root filtering, derive immediate children from the already-loaded active Area set on Area detail, and perform the live reparent through the existing cycle-safe hierarchy boundary.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Prisma/PostgreSQL, Node test runner, Railway.

## Global Constraints

- Capture dismissal remains a soft archive using `CaptureStatus.dismissed`; no capture row is hard-deleted.
- Root `/projects` renders only Areas whose `parentAreaId` is null.
- Area detail renders only immediate active children in its `Subareas` section.
- Assignment pickers and breadcrumbs retain full hierarchy paths.
- Mobile controls remain at least 44px and the confirmation sheet stays above `--app-dock-clearance`.
- Reparenting must reject missing or ambiguous active Area names and use the cycle-safe hierarchy transaction.

---

### Task 1: Confirmed capture dismissal

**Files:**
- Create: `src/components/capture-dismiss-action.tsx`
- Modify: `src/app/today/page.tsx`
- Modify: `src/app/areas/[areaId]/page.tsx`
- Modify: `scripts/capture-archive-ui.test.ts`

**Interfaces:**
- Consumes: `dismissCapture(formData: FormData): Promise<void>` from `src/app/actions.ts`.
- Produces: `CaptureDismissAction({ captureId }: { captureId: string }): JSX.Element`.

- [ ] **Step 1: Write the failing UI contract**

Add assertions that the component imports `dismissCapture`, renders a visible `Dismiss` trigger, uses `role="dialog"` and `aria-modal="true"`, includes `Keep capture` and `Dismiss capture`, and that both Today and Area Inbox render `<CaptureDismissAction captureId={capture.id} />`.

- [ ] **Step 2: Verify the contract fails**

Run: `npx tsx scripts/capture-archive-ui.test.ts`

Expected: FAIL because `src/components/capture-dismiss-action.tsx` does not exist.

- [ ] **Step 3: Implement the focused client component**

Create a client component with local `open` state. The trigger is a 44px pill. When open, render a fixed mobile sheet above `var(--app-dock-clearance)` with a modal backdrop, title `Dismiss this capture?`, explanatory copy, a `Keep capture` button that closes locally, and a form containing `captureId` whose submit action is `dismissCapture`. At `sm`, center the same panel as a dialog. Support Escape to close and focus the safe `Keep capture` action when opened.

- [ ] **Step 4: Use the component in every review-card surface**

In `RecentCapturesStrip`, render the new dismissal control beside `CaptureFileActions`. In the Area Inbox pending-capture row, replace the direct dismissal form with the same component.

- [ ] **Step 5: Verify the focused contracts pass**

Run: `npx tsx scripts/capture-archive-ui.test.ts && npx tsx scripts/capture-dismiss-and-milestone-toggle.test.ts && npx tsx scripts/today-mobile-density.test.ts`

Expected: all commands exit 0.

- [ ] **Step 6: Commit the dismissal feature**

```bash
git add scripts/capture-archive-ui.test.ts src/components/capture-dismiss-action.tsx src/app/today/page.tsx 'src/app/areas/[areaId]/page.tsx'
git commit -m "feat: confirm capture dismissal"
```

### Task 2: Root-only Area index and parent-owned subareas

**Files:**
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/areas/[areaId]/page.tsx`
- Modify: `scripts/nested-area-ui.test.ts`

**Interfaces:**
- Consumes: `AreaListItem.parentAreaId` and `LoadedArea.allAreas`.
- Produces: root-only `AreaShelves` output and `SubareaList({ areas })` links on Area detail.

- [ ] **Step 1: Write failing hierarchy UI contracts**

Replace recursive-root assertions with checks that `AreaShelves` filters `areas.filter((area) => area.parentAreaId === null)` and does not render `AreaTreeBranch`. Add checks that Area detail derives `childAreas` from `area.allAreas.filter((candidate) => candidate.parentAreaId === area.id)`, labels the section `Subareas`, and links to `/areas/${child.id}`.

- [ ] **Step 2: Verify the hierarchy contract fails**

Run: `npx tsx scripts/nested-area-ui.test.ts`

Expected: FAIL because the index still recursively renders children and Area detail has no Subareas section.

- [ ] **Step 3: Make the Areas index root-only**

Remove the `buildAreaTree`/`AreaTreeNode` import and recursive `AreaTreeBranch`. Map only the deterministic root list from `areas.filter((area) => area.parentAreaId === null)` to `AreaCard`.

- [ ] **Step 4: Add immediate children to Area detail**

Derive immediate children from `area.allAreas`, ordered by the existing query. Render a `Subareas` section after `AreaHubOverview`; each child is a 44px link with its name and a `View area` affordance. Omit the section when there are no children.

- [ ] **Step 5: Verify hierarchy tests pass**

Run: `npx tsx scripts/nested-area-ui.test.ts && npx tsx scripts/hierarchy.test.ts`

Expected: both commands exit 0.

- [ ] **Step 6: Commit Area navigation**

```bash
git add scripts/nested-area-ui.test.ts src/app/projects/page.tsx 'src/app/areas/[areaId]/page.tsx'
git commit -m "feat: move subareas into parent pages"
```

### Task 3: Full verification, release, and live hierarchy update

**Files:**
- No application files unless verification finds a scoped defect.

**Interfaces:**
- Consumes: the existing REST Area PATCH boundary or `updateAreaWithValidatedParent` transaction.
- Produces: live `HAM Radio.parentAreaId = Hobbies.id` and a successful Railway deployment.

- [ ] **Step 1: Run the complete local verification sequence**

Run sequentially:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

Expected: 356 or more tests pass with zero failures; lint, TypeScript, build, and diff checks exit 0.

- [ ] **Step 2: Push reviewed commits**

Run: `git push origin main`

Expected: main advances without force-push.

- [ ] **Step 3: Deploy the current directory to the Home Base Railway service**

Run `railway up --detach -m "Confirm capture dismissal and nest Area navigation"` with the explicit Home Base project, production environment, and web-service IDs. Poll the same scoped deployment until its terminal status is `SUCCESS`.

- [ ] **Step 4: Reparent HAM Radio safely**

Load active non-system Areas from the production database, require exactly one case-insensitive `Hobbies` match and one case-insensitive `HAM Radio` match, then call `updateAreaWithValidatedParent(hamRadio.id, hobbies.id, ...)` inside a Prisma transaction. Abort without writing on zero or multiple matches.

- [ ] **Step 5: Verify production state**

Read the two Areas back and confirm `HAM Radio.parentAreaId` equals `Hobbies.id`. Request `/projects`, `/areas/<hobbies-id>`, and `/today`; each must return HTTP 200. Confirm the deployed `/projects` markup does not render HAM Radio as a root card and the Hobbies detail markup includes HAM Radio under `Subareas`.

- [ ] **Step 6: Record the release**

Update the Home Base project work log with commits, verification counts, Railway deployment ID/status, the hierarchy mutation result, and any remaining iPhone smoke-test note.
