# Home Task Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make newly captured undated tasks visible and actionable on Home until the user files, schedules, or completes them.

**Architecture:** Persist explicit triage state on `Task`, expose one focused Home loader with exact counts and a five-row working set, and render a dedicated client Inbox card in the Home hierarchy. Extend the existing quick-edit surface with separate Assign and Schedule triggers plus parent mutation events; keep existing audited APIs authoritative.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7/PostgreSQL, Tailwind CSS, Node test runner.

## Global Constraints

- Primary mobile viewport is the iPhone 16 Pro Max at 440×956 CSS pixels; 390×844 and 1440×1000 are regression targets.
- Task Inbox means open, non-Someday, undated, top-level tasks; Area/Project assignment does not exclude a task.
- New treatment is state-based and never decays with time.
- Assignment clears New but keeps an undated task visible; scheduling, Someday, and completion remove it.
- The card shows at most five rows while displaying the exact total count.
- Assign, Schedule, and Complete have explicit accessible names and minimum 44×44 CSS-pixel targets.
- Assignment options stay lazy-loaded; writes are optimistic with rollback, Retry, and existing Undo behavior.
- Undo and later date clearing never restore New.
- Do not add Recent Captures or synthesize rows from capture input text.
- Existing audited mutation boundaries remain authoritative.

---

### Task 1: Persist task triage state across every creation path

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260716120000_task_triaged_at/migration.sql`
- Modify: `src/lib/tasks.ts`
- Modify: `src/lib/capture/service.ts`
- Modify: `scripts/import-apple-reminders.ts`
- Create: `scripts/task-triage-state.test.ts`

**Interfaces:**
- Produces nullable `Task.triagedAt: Date | null` mapped to `triaged_at`.
- Produces `initialTaskTriagedAt(input: CreateTaskInput, now?: Date): Date | null`.
- Capture and shared task creation consume the same helper; imported existing reminders are explicitly triaged.

- [x] **Step 1: Write the failing truth-table test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { initialTaskTriagedAt } from "../src/lib/tasks";

const now = new Date("2026-07-16T12:00:00.000Z");
test("only globally unfiled unscheduled tasks start untriaged", () => {
  assert.equal(initialTaskTriagedAt({ title: "Fresh" }, now), null);
  assert.equal(initialTaskTriagedAt({ title: "Dated", dueDate: now }, now), now);
  assert.equal(initialTaskTriagedAt({ title: "Later", someday: true }, now), now);
  assert.equal(initialTaskTriagedAt({ title: "Filed", areaId: "area-1" }, now), now);
  assert.equal(initialTaskTriagedAt({ title: "Project", projectId: "project-1" }, now), now);
});
```

- [x] **Step 2: Run RED**

Run: `npx tsx --test scripts/task-triage-state.test.ts`

Expected: FAIL because the helper and Prisma field do not exist.

- [x] **Step 3: Add schema and safe backfill migration**

Add beside `completedAt`:

```prisma
triagedAt      DateTime?  @map("triaged_at")
```

Migration:

```sql
ALTER TABLE "tasks" ADD COLUMN "triaged_at" TIMESTAMP(3);
UPDATE "tasks" SET "triaged_at" = "updated_at" WHERE "triaged_at" IS NULL;
CREATE INDEX "tasks_open_inbox_triaged_idx"
ON "tasks" ("triaged_at", "sort_order", "updated_at")
WHERE "status" = 'open' AND "someday" = false
  AND "due_date" IS NULL AND "parent_task_id" IS NULL;
```

Do not add a database default; future qualifying tasks must remain null.

- [x] **Step 4: Implement the shared creation rule**

```ts
export function initialTaskTriagedAt(input: CreateTaskInput, now = new Date()) {
  return input.dueDate || input.someday || input.areaId || input.projectId
    ? now
    : null;
}
```

In `createTaskWithAudit`, call it with the resolved Area/Project. In `src/lib/capture/service.ts`, use the same helper in its direct `client.task.create`. Set recurrence successors and imported Apple Reminders to a non-null creation/import timestamp so they cannot appear falsely New.

- [x] **Step 5: Generate and verify GREEN**

Run: `npm run db:generate && npx tsx --test scripts/task-triage-state.test.ts && npx prisma validate`

Expected: PASS and valid schema.

- [x] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260716120000_task_triaged_at/migration.sql src/lib/tasks.ts src/lib/capture/service.ts scripts/import-apple-reminders.ts scripts/task-triage-state.test.ts
git commit -m "feat: persist task triage state"
```

---

### Task 2: Build the exact Home Task Inbox loader

**Files:**
- Create: `src/lib/home-task-inbox.ts`
- Modify: `src/lib/today.ts`
- Create: `scripts/home-task-inbox.test.ts`

**Interfaces:**
- Produces `HomeTaskInboxData = { totalCount: number; newCount: number; rows: HomeTaskInboxRow[] }`.
- Produces `getHomeTaskInbox(client = prisma): Promise<HomeTaskInboxData>`.
- Produces `mergeHomeTaskInboxRows(untriaged, triaged, limit): HomeTaskInboxRow[]`.

- [x] **Step 1: Write failing fake-client tests**

```ts
test("loads exact counts and a deterministic five-row working set", async () => {
  const result = await getHomeTaskInbox(fakeClient as never);
  assert.equal(result.totalCount, 7);
  assert.equal(result.newCount, 2);
  assert.deepEqual(result.rows.map((row) => row.id),
    ["new-2", "new-1", "sorted-1", "sorted-2", "sorted-3"]);
  assert.deepEqual(seenWhere, {
    status: "open", someday: false, dueDate: null, parentTaskId: null,
  });
});
```

Also assert assigned-but-undated is included, while dated, Someday, completed, and subtasks are excluded.

- [x] **Step 2: Run RED**

Run: `npx tsx --test scripts/home-task-inbox.test.ts`

Expected: FAIL because the loader is missing.

- [x] **Step 3: Implement the focused loader with two ordered tiers**

```ts
export const HOME_TASK_INBOX_LIMIT = 5;
const taskInboxWhere = {
  status: "open" as const, someday: false, dueDate: null, parentTaskId: null,
};

export async function getHomeTaskInbox(client = prisma) {
  const [totalCount, newCount, untriaged, triaged] = await Promise.all([
    client.task.count({ where: taskInboxWhere }),
    client.task.count({ where: { ...taskInboxWhere, triagedAt: null } }),
    client.task.findMany({
      where: { ...taskInboxWhere, triagedAt: null }, include: { area: true, project: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: HOME_TASK_INBOX_LIMIT,
    }),
    client.task.findMany({
      where: { ...taskInboxWhere, triagedAt: { not: null } }, include: { area: true, project: true },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      take: HOME_TASK_INBOX_LIMIT,
    }),
  ]);
  return { totalCount, newCount,
    rows: mergeHomeTaskInboxRows(untriaged, triaged, HOME_TASK_INBOX_LIMIT) };
}
```

Rows expose identity, title, `areaId`, `projectId`, relations, `triagedAt`, `dueDate`, `someday`, and `starred`. Do not approximate the conditional order with one Prisma `orderBy`.

- [x] **Step 4: Share the loader with Today**

Replace the duplicate `taskInbox` query in `getTodayDashboard()` with `getHomeTaskInbox()`. Return `taskInbox`, `taskInboxTotalCount`, and `taskInboxNewCount`; retain Today’s existing presentation without a second predicate.

- [x] **Step 5: Run GREEN and commit**

Run: `npx tsx --test scripts/home-task-inbox.test.ts scripts/today-task-inbox.test.ts`

```bash
git add src/lib/home-task-inbox.ts src/lib/today.ts scripts/home-task-inbox.test.ts
git commit -m "feat: load Home task inbox"
```

---

### Task 3: Mark every allowed task mutation as triaged

**Files:**
- Modify: `src/app/api/tasks/[taskId]/assignment/route.ts`
- Modify: `src/app/api/tasks/[taskId]/schedule/route.ts`
- Modify: `src/app/actions.ts`
- Modify: `src/app/api/v1/[...path]/route.ts`
- Modify: `src/lib/tasks.ts`
- Modify: `scripts/task-quick-edit-api.test.ts`
- Modify: `scripts/task-completion-postgres.integration.ts`

**Interfaces:**
- Assignment, a changed schedule/Someday state, and completion set `triagedAt` only when null.
- Detail and generic API PATCH set it only when destination/schedule fields actually change.
- No-op assignment/scheduling remain no-ops; title, notes, star, read, and order changes never triage.

- [x] **Step 1: Extend fakes and write failing assertions**

Add `triagedAt: Date | null` to the quick-edit fake record. For changed assignment and changed schedule:

```ts
assert.ok(fake.updates[0]?.triagedAt instanceof Date);
```

Assert no-op writes remain absent. In the PostgreSQL completion test, create an untriaged task, complete it, and assert stored `triagedAt` is non-null; also assert a recurrence successor is triaged.

- [x] **Step 2: Run RED**

Run: `npx tsx --test scripts/task-quick-edit-api.test.ts`

Expected: FAIL because writes omit `triagedAt`.

- [x] **Step 3: Update assignment and schedule transactions**

Select `triagedAt` with the task. Inside actual changed updates add:

```ts
triagedAt: task.triagedAt ?? new Date(),
```

Keep each equality/no-op return before its transaction. Clearing a date later and undoing an assignment must preserve the non-null value.

- [x] **Step 4: Update completion atomically**

Add `triagedAt: task.triagedAt ?? completedAt` to the winning `updateMany` data in `completeTaskById`. Do not create a parallel completion path.

- [x] **Step 5: Cover detail and generic API task PATCH**

In `updateTaskDetail` and the v1 task PATCH transaction, compare the previous and next `dueDate`, `someday`, `areaId`, and `projectId`. Add `triagedAt: existing.triagedAt ?? new Date()` only when one of those fields changes. Saving title/notes alone must not triage.

- [ ] **Step 6: Run GREEN**

Run: `npx tsx --test scripts/task-quick-edit-api.test.ts scripts/task-completion-boundary.test.ts`

Run with the configured disposable test database: `npm run test:task-completion-postgres`

Expected: PASS; each successful write still emits exactly one audit notification.

Unit/contract coverage passed; the disposable PostgreSQL command remains pending because `TEST_DATABASE_URL` is not configured on this machine.

- [x] **Step 7: Commit**

```bash
git add src/app/api/tasks/[taskId]/assignment/route.ts src/app/api/tasks/[taskId]/schedule/route.ts src/app/actions.ts src/app/api/v1/[...path]/route.ts src/lib/tasks.ts scripts/task-quick-edit-api.test.ts scripts/task-completion-postgres.integration.ts
git commit -m "feat: triage tasks through task actions"
```

---

### Task 4: Add optimistic Home Inbox interaction state

**Files:**
- Create: `src/lib/home-task-inbox-state.ts`
- Create: `scripts/home-task-inbox-mutations.test.ts`
- Modify: `src/components/task-quick-edit.tsx`
- Modify: `scripts/task-quick-edit-ui.test.ts`

**Interfaces:**
- Produces pure immutable transitions for optimistic assign, schedule, completion, rollback, commit, undo, and server reconciliation.
- Extends `TaskQuickEdit` with `variant: "inbox"`.
- Produces `onMutation(event: TaskQuickEditMutationEvent)` where `channel` is `location | schedule` and `phase` is `optimistic | committed | rolled-back | undo`.

- [x] **Step 1: Write failing state tests**

```ts
test("assignment keeps the row and clears New optimistically", () => {
  const next = beginInboxAssignment(state, "task-1", "Hobbies / Ham Radio");
  assert.equal(next.rows[0].isNew, false);
  assert.equal(next.rows[0].path, "Hobbies / Ham Radio");
});

test("schedule removes, failure restores, and undo stays triaged", () => {
  const pending = beginInboxRemoval(state, "task-1", "schedule");
  assert.equal(pending.rows.length, 0);
  assert.equal(rollbackInboxMutation(pending, "task-1").rows[0].isNew, true);
  const undone = undoInboxRemoval(commitInboxMutation(pending, "task-1"), "task-1");
  assert.equal(undone.rows[0].isNew, false);
});
```

Also test exact total/new count transitions, Retry payload retention, independent location/schedule operations, and stale same-channel response rejection.

- [x] **Step 2: Run RED**

Run: `npx tsx --test scripts/home-task-inbox-mutations.test.ts`

Expected: FAIL because the state module is missing.

- [x] **Step 3: Implement immutable transitions**

Store bounded visible rows, exact total, exact new count, and per-task rollback snapshots. Assignment replaces path/New/count; schedule/Someday/complete removes the row and decrements counts. Failure restores the snapshot. Undo restores a removed row with `isNew: false`, increments total, and does not increment new count.

- [x] **Step 4: Expose separate Assign and Schedule triggers**

Extend `TaskQuickEdit`:

```ts
variant?: "facts" | "trigger" | "inbox";
onMutation?: (event: TaskQuickEditMutationEvent) => void;
```

For `variant="inbox"` render:

```tsx
<button aria-label="Assign task" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-[#DDE5DD] px-3 text-sm font-medium text-stone-700"
  onClick={() => showDialog("move", assignRef.current)}>
  <FolderInput size={16} /><span>Assign</span>
</button>
<button aria-label="Schedule task" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-[#DDE5DD] px-3 text-sm font-medium text-stone-700"
  onClick={() => showDialog("quick", scheduleRef.current)}>
  <CalendarDays size={16} /><span>Schedule</span>
</button>
```

Emit events around existing independent `MutationChannel` operations. Keep the lazy destination GET and do not share cancellation across location and schedule channels.

- [x] **Step 5: Run GREEN and commit**

Run: `npx tsx --test scripts/home-task-inbox-mutations.test.ts scripts/task-quick-edit-coordinator.test.ts scripts/task-quick-edit-ui.test.ts scripts/task-quick-assignment-ui.test.ts`

```bash
git add src/lib/home-task-inbox-state.ts src/components/task-quick-edit.tsx scripts/home-task-inbox-mutations.test.ts scripts/task-quick-edit-ui.test.ts
git commit -m "feat: add optimistic Home inbox actions"
```

---

### Task 5: Render the adaptive iPhone Home Task Inbox

**Files:**
- Create: `src/components/home-task-inbox.tsx`
- Modify: `src/app/page.tsx`
- Create: `scripts/home-task-inbox-ui.test.ts`
- Modify: `scripts/home-no-receipts.test.ts`

**Interfaces:**
- Consumes `HomeTaskInboxData`, `TaskQuickEdit variant="inbox"`, and the optimistic state helpers.
- Produces `HomeTaskInbox({ data, today })` with exact count, bounded rows, three actions, centralized feedback, and Retry.
- Produces `homeStatusHeadline(dueCount, inboxCount, newCount)` for deterministic status copy.

- [x] **Step 1: Write the failing UI/status contract**

```ts
assert.equal(homeStatusHeadline(0, 1, 1), "0 due today. 1 new task in Inbox.");
assert.equal(homeStatusHeadline(2, 3, 0), "2 due today. 3 tasks in Inbox.");
assert.match(home, /dueToday\.length === 0[\s\S]*<HomeTaskInbox/);
assert.match(home, /dueToday\.length > 0[\s\S]*<HomeTaskInbox/);
assert.match(card, /Open all/);
assert.match(card, /Assign task/);
assert.match(card, /Schedule task/);
assert.match(card, /Complete task/);
assert.match(card, /min-h-11/);
assert.doesNotMatch(home, /RecentCaptures/);
```

Also assert the card omits itself at zero, renders at most five rows, displays the exact total, labels only null-`triagedAt` rows New, and links to `/tasks?section=unscheduled#unscheduled`.

- [x] **Step 2: Run RED**

Run: `npx tsx --test scripts/home-task-inbox-ui.test.ts scripts/home-no-receipts.test.ts`

Expected: FAIL because the card and adaptive branches do not exist.

- [x] **Step 3: Build the client card**

Use `min-w-0`, wrapping title/path, a restrained teal New treatment, and explicit 44px Assign/Schedule/Complete controls. Completion calls `/api/tasks/:id/complete`, removes optimistically, restores on failure, and exposes Retry through one card-level `aria-live` region so row portals do not collide. Title links to `/tasks/:id`; path uses Project plus Area path, or `Inbox`.

- [x] **Step 4: Integrate adaptive Home placement and truthful status**

Pass exact Inbox counts into `StatusLine` and gate `clearThroughTomorrow` with `taskInboxTotalCount === 0`. In the left Home column:

```tsx
{todayData.dueToday.length === 0 ? <HomeTaskInbox data={taskInboxData} today={todayData.today} /> : null}
<TodayCard />
{todayData.dueToday.length > 0 ? <HomeTaskInbox data={taskInboxData} today={todayData.today} /> : null}
<UpcomingCard items={todayData.upcomingCommitments} />
```

The condition uses due-task count, never calendar-event count. Extract `TodayCard` only if needed to keep the page readable.

- [x] **Step 5: Preserve canonical capture reconciliation**

Keep `CaptureBar.submitCapture()` calling `router.refresh()` after the POST succeeds. The Home card consumes only loader rows; never insert `rawText`, receipt labels, or `createdItems` into the task list client-side.

- [x] **Step 6: Run GREEN and commit**

Run: `npx tsx --test scripts/home-task-inbox-ui.test.ts scripts/home-task-inbox-mutations.test.ts scripts/home-no-receipts.test.ts scripts/today-hide-empty-calendar.test.ts scripts/task-quick-edit-ui.test.ts`

```bash
git add src/components/home-task-inbox.tsx src/app/page.tsx scripts/home-task-inbox-ui.test.ts scripts/home-no-receipts.test.ts
git commit -m "feat: surface task inbox on Home"
```

---

### Task 6: Full verification and iPhone review

**Files:**
- Modify only files required by verified Critical or Important findings.
- Update `docs/superpowers/plans/2026-07-16-home-task-inbox.md` checkboxes as work completes.

**Interfaces:**
- Validates the complete feature and introduces no new product surface.

- [x] **Step 1: Run automated verification**

```bash
npm test
npm run lint
npx tsc --noEmit
npx prisma validate
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Apply migration to the configured development database**

Run: `npm run db:deploy`

Expected: `20260716120000_task_triaged_at` applies and historical Inbox tasks are non-null.

- [ ] **Step 3: Verify behavior at 440×956**

Create a global undated task through Capture and verify: receipt remains visible, Home refreshes, status acknowledges Inbox, and the canonical task is first with New without a manual reload. Assign it and verify it remains but loses New. Schedule and complete separate fresh tasks and verify immediate removal. Simulate failure and verify rollback/Retry.

- [ ] **Step 4: Verify responsive and accessibility regressions**

Repeat at 390×844 and 1440×1000. Confirm no horizontal overflow or dock/capture overlap; long titles and hierarchy paths wrap; focus trap/restoration and Escape work; controls are at least 44px; live announcements are accessible; no action requires a swipe.

- [x] **Step 5: Request whole-feature review and fix findings**

Use `superpowers:requesting-code-review` against the implementation commits. Fix every Critical and Important finding with a regression test, then repeat Step 1.

- [x] **Step 6: Commit verified fixes only when needed**

List the reviewed files with `git diff --name-only`, stage each path explicitly, and commit them with `git commit -m "fix: harden Home task inbox"`. Do not create an empty commit when review produces no changes.
