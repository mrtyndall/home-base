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

## Phase 2

### Step 4 — Check-in Feed with AI Summarize
- Built: `check_ins` table (append-only; enum source manual/ai_draft/ai_draft_edited/voice; captureId lineage) via additive migration `20260703182303_check_ins`, with a lossless in-migration data migration turning every non-empty `current_state`/`next_step` into the record's first check-in (pre-counts 7 projects + 3 areas with state → post-counts exactly 7 project + 3 area check-ins; columns retained). `src/lib/checkins.ts` (create+audit notification, latest-per-parent query, Haiku summarizer over completed tasks/notes/docs/milestones/activity since last check-in — model `ANTHROPIC_SUMMARIZE_MODEL`, default claude-haiku-4-5), server actions `postCheckIn` (honest source: unedited draft → ai_draft, edited → ai_draft_edited, typed → manual) and `requestCheckInDraft` (never auto-posts; honest "No new activity" and "not configured" states). `CheckInFeed` + `CheckInComposer` (collapsed button at rest — no resting input) on project and area pages. current_state/next_step retired from all UI (headers, edit-state forms, cards, area project list); cards now surface the latest check-in snippet + date. Parser: `check_in` action (prompt, zod, fallback regex, service execution incl. voice source); legacy `update_project_state`/`update_area_state` narration also posts a check-in so captured state never becomes invisible. Check-ins added to Search.
- Fixed along the way (live-LLM testing): parser system prompt never stated the JSON shape — Sonnet emitted `"action"` instead of `"type"` keys and routed project names to area_match; prompt now shows explicit examples and a "known project ⇒ project_match" rule. (Failed captures were preserved as pending Inbox captures throughout — sacred path held.)
- Test (work-order): completed two tasks on the test project + added a note (all via capture, live Sonnet parse), hit AI draft in the composer → coherent Haiku draft citing the two tasks and the SWR note; posted an unedited draft → source `ai_draft`; regenerated after fresh activity, edited via real keystrokes, posted → source `ai_draft_edited`; snippet + date render on the project card and area project list. "No new activity since the last check-in" honest path verified. Capture "check in on the M5T step3 project: …" → check_in posted. PASS.
- Gates: tsc clean, eslint clean, build succeeds.
- Commit: (this commit)
- DEVIATION: no /settings AI card added — the composer itself reports the not-configured state; a settings surface for AI services can ride with Step 12 (chat) where it's load-bearing. DEVIATION: legacy update_*_state actions kept (they still write retained columns + activity) but now co-post a check-in when narration is present.

### Step 5 — Surface Milestones
- Built: MilestonesPanel now always renders on project pages (visible Add action even with zero milestones — no resting input; the form lives behind the Add disclosure). Progress as plain text: "N of M milestones" in the project page header and on shelf cards (milestone groupBy). `completeMilestone` now writes a `projectActivity` entry ("Milestone completed: <title>."), feeding Step 4 summaries.
- Test (work-order): added three milestones through the UI, completed one → header showed "0 of 1"→"0 of 2"→"0 of 3"→"1 of 3", card shows "1 of 3 milestones", Activity shows "Milestone completed: Igate on air." PASS.
- Gates: tsc clean, eslint clean, build succeeds.
- Commit: 371782f

### Phase 2 VERIFY
- Fresh-eyes verification subagent: **PASS**. Gates green; migration losslessness confirmed by SQL anti-join (0 missing); UI retirement of current_state/next_step confirmed; append-only holds (no checkIn.update/delete anywhere); live check_in capture + honest sources (manual/ai_draft/ai_draft_edited all present in DB); milestone surfacing verified live; constitution grep clean; sacred capture path intact.
- Defects reported and fixed in the follow-up commit:
  1. Capture-path check-ins skipped the `check_in_posted` audit notification → all three service-side check-in writes now route through `createCheckInRecord` (verified: notification count increments on capture check-ins).
  2. Check-ins didn't count toward project "Touched"/slippage last-activity → `getLastTouched` now includes the latest check-in date.
  3. ACCEPTED (not fixed): AI-draft provenance is client-asserted — the server compares posted text to a client-supplied draft string; a modified client could post AI text as `manual`. Single-user app, self-deception risk only; server-side draft persistence would be the fix if it ever matters. Logged as a known limitation.
- Cosmetic: the garbled `ai_draft_edited` test check-in was displaced by a clean follow-up check-in (append-only respected).
- Phase 2 gate: PASSED. Proceeding to Phase 3.

## Phase 3

### Step 6 — Journal
- Built: `journal_entries` table (entryDate, bodyMd, source typed/voice/import, tags[], resurfaceWeight 1.0, lastSurfacedAt, captureId, status active/killed) via additive migration with GIN FTS indexes on journal_entries.body_md AND check_ins.body_md (the latter was missed in Phase 2). Ideas tab renamed **Library** (tab label + page heading; route stays /ideas) with a Journal section — reverse-chron, grouped by date, no heatmap, no empty-day placeholders, no streaks. Parser: `journal` action (prompt rule for "journal:" + reflective first-person narration, zod, fallback regex, service execution with entry_date defaulting to today in America/New_York). Journal entries added to Search.
- Fixed along the way: capture voice detection was dead code — `writeSource` never carried the raw capture source, so voice check-ins/journal recorded as manual/typed. `ExecutionContext` now carries `captureSource`; all four voice-detection sites use it.
- Test (work-order): voice-captured a journal entry (`source: in_app_voice`) → "Journal entry saved"; renders in Library under today's date with source "voice"; found via /search?q=digipeat with type "Journal". PASS. (One earlier capture failed against a stale dev-server Prisma client — raw capture preserved as pending Inbox per the sacred path; server restarted.)
- Gates: tsc clean, eslint clean, build succeeds.
- Commit: (step-6 commit)
- DEVIATION: route stays `/ideas` (tab renamed only) — smallest change; a URL rename would break nothing for anyone but adds churn.

### Step 7 — Resurfacing Engine
- Built: `resurfacing_seen` table (itemType journal_entry/idea, itemId, surfacedOn date, response kept/dismissed/annotated); `Idea` gains `resurfaceWeight`/`lastSurfacedAt` (additive) so boosts work on both item types. `src/lib/resurfacing.ts`: lazy daily selection on first Today load (pool = journal entries >30d + seed/developing ideas >60d, weighted random by resurfaceWeight, items seen within 90d excluded; empty pool renders nothing; one item per day — after a response the surface stays quiet until tomorrow). `/api/cron/resurface` (CRON_SECRET) as the midnight-cron/test hook with `?force=1`. Today card after Tomorrow, styled kin to the receipt strip: item, plain age fact ("45 days ago"), three quiet actions — add a thought (idea → idea note; journal → new journal entry tagged resurfaced-thought), boost (weight ×2 cap 8, response kept), dismiss (response only). All three write audit notifications. Parser: `boost_resurface { item_match }` (prompt + fallback + service).
- Test (work-order): seeded two backdated journal entries (45d/40d); forced the job → card showed memory alpha with all three actions; clicked Dismiss in the UI → card gone, seen row response=dismissed; forced again → different item (memory beta) rendered. Boost via capture "boost M5V p3 memory beta" → weight 1.0→2.0. PASS.
- Gates: tsc clean, eslint clean (one react-hooks/purity error fixed by computing ageDays in the lib, not render), build succeeds.
- Commit: (this commit)
- DEVIATION: "add a thought" on a journal memory writes a new journal entry tagged `resurfaced-thought` (journal has no notes table; append-only preserved). DEVIATION: dismiss leaves resurfaceWeight unchanged — the 90-day seen exclusion already keeps dismissed items away; permanent down-weighting on one dismissal would drift toward hiding.

### Step 8 — Needs Review (smart follow-ups)
- Built: `scheduled_reviews` table (captureId, reviewAt?, conditionText?, status pending/surfaced/done/dismissed). Parser: `schedule_review { review_at | review_condition_text }` emitted on future-facing non-datable intent (prompt rule + fallback regex + service execution; capture_id from context; requires date or condition). Daily job `/api/cron/reviews` (CRON_SECRET) flips due pending→surfaced, writes a `review_surfaced` notification per item, and — date-anchored reviews reaching their window being exactly the existing time-sensitive push trigger — sends one Pushover nudge per newly surfaced review with a Nudge audit row (skips quietly when Pushover unconfigured). New `src/lib/pushover.ts` helper. Inbox area page gains a "Needs review" group at the top (plain list): capture text, plain "Review date <d>"/"Waiting: <condition>" fact, convert chips (Task/Idea/Note/Reference via the existing conversion path — converting also settles the review as done), snooze (date picker, back to pending), done, dismiss. All outcomes audited in notifications.
- Test (work-order): captured "revisit the drone insurance quote in two weeks" → review row landed with review_at 2026-07-17 (LLM also stored the condition text); forced the date to today via SQL; ran the job → `{"surfaced":1,"nudged":0}` (Pushover not configured locally — honest skip); row rendered in Needs review with all outcomes; clicked Task convert in the UI → open task created, review status `done`, panel cleared. PASS.
- Gates: tsc clean, eslint clean, build succeeds.
- Commit: (this commit)
- DEVIATION: condition-only reviews (no date) are shown in the Needs review group as "Waiting: <condition>" rather than hidden until a date exists — nothing is ever invisible, and there is no other surface for them. DEVIATION: every date-anchored review that comes due sends the time-sensitive nudge (that is the trigger-2 semantic); condition-only reviews never push.

### Phase 3 VERIFY
- Fresh-eyes verification subagent: **PASS**. Gates green; Steps 6–8 re-executed live (voice journal, FTS indexes, resurfacing pool/exclusion/one-per-day logic, cron auth 401/503, snooze via the real UI form, honest nudged=0, convert-settles-review); constitution grep clean; regressions clean.
- Defects reported and fixed in the follow-up commit:
  1. Resurfaced card formatted journal `entryDate` (date-only UTC) in America/New_York — showed the previous day and disagreed with Library → journal dates now use `formatDateOnly` (UTC); idea timestamps keep `formatShortDate`.
  2. "Needs review" group rendered below Check-ins on the Inbox area page — moved to the top, per the work order.
- Noted, accepted: `resurfacing_seen` has no unique constraint on surfaced_on (single-user; a concurrent-first-load race could double-select — harmless); /search uses ILIKE rather than the GIN FTS indexes (pre-existing search approach; indexes are in place for a future FTS query switch).
- Phase 3 gate: PASSED. Proceeding to Phase 4.

## Phase 4

### Step 9 — Routines and Completions
- Built: `routines` (schedule jsonb {frequency daily/weekly/custom, days[], timeWindow}, goal jsonb, graceWindow jsonb, temporary, start/end dates, status active/paused/retired) + `routine_completions` via additive migration. `src/lib/routines.ts`: schedule parsing, due-today logic (weekly = due until completed that week), one-completion-per-day (second tap is a silent no-op), run length as plain fact (consecutive scheduled days, misses inside the grace window don't end the run; weekly counts completed weeks; a gap just ends the count — run 0 renders nothing), lazy auto-retire of temporary routines past endDate (status change with notification; history kept). Routines view inside the Tasks tab (per work-order preference — no free tab slot): rows show name, window/schedule fact, today's state ("Done today" / one-tap complete); expandable detail shows description, dates, run fact, completion history. Today gains a compact "Routines" line of plain checkable items (completed = quiet teal check; nothing renders tomorrow for missed windows since due-ness is computed per day; empty = nothing). Server action `completeRoutine` + parser `create_routine`/`complete_routine` ("did my morning stretch") with audit notifications. Routines never appear in task views, task counts, or slippage — fully separate tables and queries.
- Test (work-order): captured "start a temporary M5T morning stretch routine on weekdays, mornings, with a 1 day grace window, running until July 10" → routine created with custom mon–fri / morning / grace {days:1} / temporary / end 2026-07-10. Completed via "did my morning stretch" → Done today on both surfaces. Skipped a day (completion backdated 2 days) → run fact "Run: 1 days" survives the grace window, routine renders plainly as due again, zero red classes, zero streak/broken/lost copy anywhere on /today or the routines view. Set endDate past → lazy auto-retire flipped status to retired (history intact, visible under a Retired group, off the Today line). PASS.
- Gates: tsc clean, eslint clean, build succeeds.
- Commit: (this commit)
- DEVIATION: weekly-frequency routines are treated as due until completed once in the ISO week (goal.timesPerWeek stored but not yet enforced beyond once — smallest interpretation; the goal field is preserved for later use).
