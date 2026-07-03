# M5 Progress Log

Session: autonomous build, branch `m5`, started 2026-07-03.
Format per step: what was built, test result, commit hash, deviations.

---

## Setup

- Branch `m5` created off latest `main` (16f718d). Work order saved to `docs/M5-MASTER-WORK-ORDER.md`.

## Phase 1

### Step 0 — SCOPE/DECISIONS amendments
- Built: Added SCOPE.md "Section 19: M5 Amendments" (six amendments, explicit supersede language) and DECISIONS.md "M5 Decisions" block (Routines ACTIVATED w/ streak amendment, People CRM ACTIVATED, quotes/books DEFERRED, data chat REVIVED).
- Test: docs-only step, no written test in work order; typecheck/lint/build verified at end of Step 1.
- Commit: 48a039c
- DEVIATION: amendments added as a dedicated Section 19 with "amendments win" language rather than rewriting Sections 4/7/12 in place — smallest change that makes SCOPE.md unambiguous, keeps the diff reviewable.

### Step 1 — Starred Top Tasks
- Built: `starred Boolean @default(false)` on Task + `@@index([starred, status])` (additive migration `20260703174826_task_starred`). `toggleTaskStar` server action with audit notification; `TaskStarButton` on task rows (Tasks tab incl. subtasks, Today rows) and task detail. Today gains a "Top Tasks" strip above Due Today (starred open tasks, capped 3, plain link "N more starred in Tasks" when over cap; renders nothing when empty). Tasks tab gains a `starred=1` filter (chip row, preserved across domain/project/section links). Parser: new `star_task { task_match, starred? }` action (prompt + zod + fallback regex + service execution via `setTaskStarredByMatch`, audited), and `create_task` accepts `starred`.
- Test (work-order): seeded 3 test tasks (`M5T step1 task A/B/C`) in dev DB; starred all three via `/api/capture` ("star the … task") — all appeared in Top Tasks on /today; completed one via capture — it vanished instantly and the strip showed the remaining two. `/tasks?starred=1` shows exactly B and C. PASS.
- Gates: `tsc --noEmit` clean, `eslint --max-warnings=0` clean, `next build` succeeds.
- Commit: (this commit)
- Notes: test tasks B/C left open+starred in dev DB for phase VERIFY; will be completed (never deleted) at session end. Seed script kept at `scripts/m5-step1-seed.ts`.

### Step 2 — Task Views
- Built: Tasks tab view control with **Schedule** (existing sections + jumps), **All Open** (every open task, due date asc, undated last, cap 200), **Done** (completed, newest first, cap 100), **All** (open + done stacked). `view` searchParam (`normalizeTaskView`, carried through every filter href). Domain/project/starred filters apply in all views; star/complete inline actions available wherever tasks are open; Done rows link to detail with a plain "completed <date>" fact.
- Test (work-order): switched all four views via URL — each renders; created `M5T step2 task`, saw it in All Open, completed it, it left All Open and appeared in Done (newest first) with completion date. Existing `task-filter-links` unit tests still pass. PASS.
- Gates: tsc clean, eslint clean, build succeeds.
- Commit: cf8c5a3

### Step 3 — Slippage as Fact
- Built: `src/lib/slippage.ts` — `getTaskSlipDays()` (app_settings key `task_slip_days`, default 14), `taskOpenSinceFact()` ("open since Jun 12" for open, non-someday tasks with no create/update activity inside the threshold), `projectLastActivityFact()` ("Last activity Jun 20" for active projects past their per-project `slipThresholdDays`). Task fact renders in the row detail line across all Tasks-tab views; project fact renders as a plain sentence on active project cards (replacing the tiny "Touched" span only on slipping cards to avoid stating the same date twice). `getLastTouched` now also counts task creation as activity. No color, no badge, no sort change, nothing hidden.
- Test (work-order): created `M5T step3 aging task` + `M5T step3 project` in dev, backdated 20/30 days via SQL — "open since Jun 13" renders on the task row (still fully visible), "Last activity Jun 3" renders on the project card (still on the Active shelf). No red styling anywhere. PASS.
- Gates: tsc clean, eslint clean, build succeeds.
- Commit: (this commit)
- DEVIATION: someday tasks excluded from the task slip fact (someday = wanted-not-committed; an "open since" fact there reads as guilt). DEVIATION: task fact shown on Tasks-tab rows (all views), not Today rows — Today already surfaces overdue items in place; smallest interpretation that passes the test.

### Phase 1 VERIFY
- Fresh-eyes verification subagent: **PASS**. Gates green; Steps 0–3 re-executed live against the dev server and passed; constitution grep clean (no red states, badges, guilt copy, deletes, or capture-loss paths in the diff).
- Minor defects reported and fixed in the follow-up commit:
  1. Open subtasks of a completed parent vanished from all task views → open-task queries now also surface open tasks whose parent is no longer open.
  2. All Open/Done caps (200/100) were silent → headers now show the true total and a plain "Showing the first N of M… Search finds every task." line when truncated (only when no filters are active, so counts stay honest).
  3. Project cards computed last-touched from a 60-task slice ordered by due date — could produce a false slip fact → replaced with a `task.groupBy` max over created/completed/updated per project.
  4. Fallback star regex could coerce prose ("star gazing would be lovely") into a failed star_task → now requires "star the/my …" or "… task" suffix.
  5. Extended `scripts/task-filter-links.test.ts` to cover `starred`/`view` params.
- Known-and-accepted: LLM parser paths untested locally (no ANTHROPIC key in dev env — fallback parser exercised instead; key will be injected as process env for Step 4 testing). Verifier completed test records `M5T step1 task B/C`; two failed test captures remain as pending Inbox captures in the dev DB (test noise, captures preserved by design).
- Phase 1 gate: PASSED. Proceeding to Phase 2.
