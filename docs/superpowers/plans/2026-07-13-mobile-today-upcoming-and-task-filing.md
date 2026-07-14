# Mobile Today, Upcoming, and Task Filing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-item chronological Upcoming preview, quick filing for unassigned tasks, and a denser action-only Today experience on iPhone.

**Architecture:** Extend the existing Today dashboard with bounded future queries and merge them through a pure helper. Reuse the task assignment API through a focused client component. Keep Today's information architecture while making empty states compact and filtering captures through a pure actionable-capture predicate.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7, Tailwind CSS 4, Node test runner through `tsx --test`.

## Global Constraints

- Upcoming contains at most the next three future dated tasks and calendar events, excluding Today.
- An unassigned open task shows `Assign to Area or Project`; assigned tasks do not.
- Project selection derives the Project's Area through the existing verified destination endpoint.
- Today shows only captures requiring action and labels the section `Captures to review`.
- Preserve the existing Home Base palette, typography, minimum tap targets, desktop spacing, and sticky mobile controls.
- No schema migration or destructive database command.

---

### Task 1: Upcoming Commitments Data Contract

**Files:**
- Create: `src/lib/upcoming-commitments.ts`
- Create: `scripts/upcoming-commitments.test.ts`
- Modify: `src/lib/today.ts`

**Interfaces:**
- Produces: `mergeUpcomingCommitments(tasks, events, limit): UpcomingCommitment[]`
- `UpcomingCommitment` is a discriminated union with `kind`, `id`, `title`, `at`, `date`, and optional `time`.

- [ ] **Step 1: Write the failing pure ordering test**

```ts
assert.deepEqual(
  mergeUpcomingCommitments(tasks, events, 3).map((item) => item.id),
  ["untimed-tomorrow", "event-tomorrow", "task-day-three"],
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx tsx --test scripts/upcoming-commitments.test.ts`
Expected: FAIL because `src/lib/upcoming-commitments.ts` does not exist.

- [ ] **Step 3: Implement the pure merge and bounded dashboard queries**

```ts
export function mergeUpcomingCommitments(tasks, events, limit = 3) {
  return [...taskItems, ...eventItems]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, limit);
}
```

Query future open non-someday tasks with `dueDate > todayDate` and future events with `start >= todayCalendarBounds.end`, each bounded before merging.

- [ ] **Step 4: Run the focused test and full existing Today tests**

Run: `npx tsx --test scripts/upcoming-commitments.test.ts scripts/today-hide-empty-calendar.test.ts scripts/today-task-inbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/upcoming-commitments.ts src/lib/today.ts scripts/upcoming-commitments.test.ts
git commit -m "feat: add upcoming commitment feed"
```

### Task 2: Home Upcoming Preview

**Files:**
- Modify: `src/app/page.tsx`
- Create: `scripts/home-upcoming-ui.test.ts`

**Interfaces:**
- Consumes: `todayData.upcomingCommitments: UpcomingCommitment[]` from Task 1.

- [ ] **Step 1: Write the failing Home UI contract test**

```ts
assert.match(homeSource, /SectionHeader title="Upcoming"/);
assert.match(homeSource, /calendar-events\/\$\{item\.id\}/);
assert.match(homeSource, /tasks\/\$\{item\.id\}/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test scripts/home-upcoming-ui.test.ts`
Expected: FAIL because Home has no Upcoming section.

- [ ] **Step 3: Render a compact Upcoming card after Today**

Use the existing white card, teal icon language, serif-free row typography, and responsive grid. Render task/event type, short date, and time; omit the card when empty.

- [ ] **Step 4: Run focused UI tests**

Run: `npx tsx --test scripts/home-upcoming-ui.test.ts scripts/home-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx scripts/home-upcoming-ui.test.ts
git commit -m "feat: show upcoming commitments on home"
```

### Task 3: Quick Filing for Unassigned Tasks

**Files:**
- Create: `src/components/task-quick-assignment.tsx`
- Modify: `src/app/tasks/[taskId]/page.tsx`
- Create: `scripts/task-quick-assignment-ui.test.ts`

**Interfaces:**
- Consumes: existing `PATCH /api/tasks/[taskId]/assignment` body `{ areaId: string | null, projectId: string | null }`.
- Produces: `TaskQuickAssignment` client component accepting task ID, active Areas, and eligible Projects.

- [ ] **Step 1: Write the failing visibility and endpoint contract test**

```ts
assert.match(detailSource, /!task\.areaId && !task\.projectId/);
assert.match(componentSource, /Assign to Area or Project/);
assert.match(componentSource, /api\/tasks\/\$\{taskId\}\/assignment/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test scripts/task-quick-assignment-ui.test.ts`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the compact inline picker**

The trigger appears only for open unassigned tasks. Area and Project selectors use 44px controls; changing Area clears a mismatched Project; selecting Project sends its ID and lets the endpoint derive Area. Retain selections and show `Assignment was not updated.` after failure; refresh after success.

- [ ] **Step 4: Run focused assignment tests**

Run: `npx tsx --test scripts/task-quick-assignment-ui.test.ts scripts/area-first-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/task-quick-assignment.tsx 'src/app/tasks/[taskId]/page.tsx' scripts/task-quick-assignment-ui.test.ts
git commit -m "feat: add quick filing for inbox tasks"
```

### Task 4: Compact Today and Actionable Captures

**Files:**
- Create: `src/lib/actionable-captures.ts`
- Modify: `src/app/today/page.tsx`
- Modify: `src/components/task-scheduling.tsx`
- Create: `scripts/today-mobile-density.test.ts`
- Create: `scripts/actionable-captures.test.ts`

**Interfaces:**
- Produces: `isActionableCapture(capture): boolean` for pending, ambiguous, or failed active captures.

- [ ] **Step 1: Write failing capture and mobile-density tests**

```ts
assert.equal(isActionableCapture(processedTaskCapture), false);
assert.equal(isActionableCapture(pendingCapture), true);
assert.match(todaySource, /Captures to review/);
assert.match(dropZoneSource, /isEmpty \? "min-h-0"/);
```

- [ ] **Step 2: Run both tests and verify RED**

Run: `npx tsx --test scripts/actionable-captures.test.ts scripts/today-mobile-density.test.ts`
Expected: FAIL because the predicate and compact contracts do not exist.

- [ ] **Step 3: Implement action-only capture filtering and mobile spacing**

Filter recent captures before rendering, rename the section, omit it when empty, reduce `space-y-7` to compact mobile values with `sm:` restoration, and remove reserved height from empty drop zones while keeping populated drag targets unchanged.

- [ ] **Step 4: Run focused tests**

Run: `npx tsx --test scripts/actionable-captures.test.ts scripts/today-mobile-density.test.ts scripts/today-capture-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actionable-captures.ts src/app/today/page.tsx src/components/task-scheduling.tsx scripts/actionable-captures.test.ts scripts/today-mobile-density.test.ts
git commit -m "fix: tighten mobile today review flow"
```

### Task 5: Integrated Verification and Release

**Files:**
- Modify only if verification reveals an in-scope defect.

- [ ] **Step 1: Run the complete gate**

Run: `npm test && npm run lint && npx tsc --noEmit --incremental false && npx prisma validate && npm run build && git diff --check`
Expected: exit 0 with no failures.

- [ ] **Step 2: Verify iPhone layout and interaction**

Use a 390x844 browser viewport. Verify Home with Today plus Upcoming, Today with compact empty sections and no processed captures, and an unassigned task with the quick filing picker. Confirm no horizontal overflow and 44px assignment controls.

- [ ] **Step 3: Review the final diff and deploy**

Deploy the exact clean commit through Railway, poll to terminal `SUCCESS`, inspect startup logs, and check Home, Today, and task-detail HTTP/browser behavior.

- [ ] **Step 4: Update local runtime and GitHub**

Fast-forward `main`, rebuild and restart `com.mrtyndall.home-base` and MCP LaunchAgents, verify port 3002, then push `main` without force.
