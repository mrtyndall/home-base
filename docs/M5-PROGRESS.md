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
- Commit: (this commit)
