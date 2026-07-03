# Home Base — Work Order M5 (Master): Memory, Rhythm, and Intelligence

For the implementing agent (Claude Code or Codex). This supersedes the earlier M5 memory-layer order entirely. It consolidates Matt's full review of the reference system against the current build. Read CLAUDE.md/AGENTS.md, SCOPE.md, and DECISIONS.md first. Note the repo runs Next.js 16 with breaking changes; per AGENTS.md, read the guides in node_modules/next/dist/docs/ before writing framework-touching code. All integrity rules hold, plus: surfaces never ask, derived beats declared, markdown is canonical, no guilt mechanics, quick capture is never slowed. Commit per step; do not start N+1 until N passes its test. SCOPE.md wins on conflict; stop and flag.

### Current State: Extend, Do Not Rebuild

- Bottom tabs live in `src/components/app-shell.tsx` (Search and Settings are top utility). 
- Ideas components are the redesigned expandable records; reuse as-is.
- Milestones schema and checklist UI were built in M3 (`milestones` table, project page). Step 5 surfaces them; do not rebuild.
- The parser lives in `src/lib/capture/service.ts`; pending-capture machinery and convert chips exist. Reminder delivery via Pushover exists (native push is a noted future item, do not build now).
- Project cards were rebuilt in M4 as derived-only. Step 4 changes what they derive, not the principle.

## Step 0: SCOPE.md and DECISIONS.md Amendments

Merge into SCOPE.md:

1. **Check-ins replace current_state as the living record of projects and areas.** A check-in is a timestamped markdown status update, event-shaped: written when there is something to say, never prompted. The latest check-in snippet is what cards surface. current_state and next_step columns are retired from all UI (retain columns; migrate existing values into an initial check-in per project/area).
2. **Slippage is factual surfacing, never disappearance.** A slipping project or aging task gains visibility with plain facts (last activity date). Nothing is ever hidden, dimmed, archived, or removed by the system for inactivity.
3. **Streak amendment to the no-guilt rule:** routines may record completion history and current run length as plain fact. Banned forever: broken-chain framing, red states, "you lost your streak" copy, or any rendering that makes a gap look like failure. Grace windows are configurable. A gap renders as nothing.
4. **Domain pages are views, not containers.** A domain gets a description (set once via an explicit edit action) and a page aggregating its areas, projects, and task pulse, all derived. Nothing ever attaches to a domain.
5. **Memory layer, phase 1:** journal plus resurfacing. Quotes and books are explicitly deferred to a future phase (record in DECISIONS.md as Deferred, not dropped).
6. **AI services** are a first-class layer: the capture parser (exists), the check-in summarizer, the needs-review scheduler, and data chat. All use the Anthropic API (Haiku for cheap routes, Sonnet where quality matters), all writes they produce carry lineage and appear in the notifications feed.

Record in DECISIONS.md: Routines module ACTIVATED (with the streak amendment), People CRM module ACTIVATED, quotes/books DEFERRED, in-app data chat REVIVED (previously paused in favor of MCP; MCP remains and chat is a thin client over the same capability).

## Part A: Task Surfaces

### Step 1: Starred Top Tasks
- Add `starred Boolean @default(false)` to Task. Star/unstar from task rows and detail.
- Today screen gains a "Top Tasks" strip above Due Today: starred open tasks, capped at 3 visible (more exist in Tasks tab under a Starred filter). Plain rendering, no badges.
- Parser: "star the coax connectors task" / create_task accepts starred.
- Test: star three tasks, see them on Today; complete one, it vanishes instantly and the strip shows two.

### Step 2: Task Views
- Tasks tab gains a view control: **Schedule** (current sections), **All Open** (every open task sorted by due date, undated last), **Done** (completed, newest first), **All**.
- Domain filter and inline actions work in every view.
- Test: switch views, complete a task from All Open, confirm it appears in Done.

### Step 3: Slippage as Fact (tasks and projects)
- Task rows older than a threshold (app_settings, default 14 days open with no activity) show a quiet plain-text fact: "open since Jun 12". No color, no badge, no sorting punishment.
- Active projects whose last activity (task/note/check-in/log) exceeds their slip threshold surface the same way on their cards: "last activity Jun 20". Parked, someday, and area records never show slippage.
- Nothing is ever hidden or auto-moved for slipping.
- Test: backdate a task and project in dev, confirm the facts render and nothing disappeared.

## Part B: Check-ins and Milestones

### Step 4: Check-in Feed with AI Summarize
- New `check_ins` table: id, parentType (area/project), parentId, bodyMd, source (manual/ai_draft_edited/ai_draft/voice), captureId?, createdAt. Append-only.
- Project and area pages get a check-in feed (newest first) and a compose action. Cards surface the latest check-in snippet plus its date in place of the retired state line.
- **AI summarize button:** drafts a check-in by summarizing everything since the last check-in: completed tasks, added notes/docs, milestones hit, activity log entries. Model: Haiku. The draft opens in the editor for Matt to edit or accept; never auto-posts. Source recorded honestly (ai_draft vs ai_draft_edited).
- Parser: "check in on the APRS build: igate is live and receiving" → check_in.
- Migration: existing current_state values become each record's first check-in.
- Test: complete two tasks on a project, add a note, hit summarize, receive a coherent draft citing them, edit one word, post, see the snippet on the card.

### Step 5: Surface Milestones
- Milestones exist from M3. Ensure: visible add action on project pages, progress shown as plain text ("2 of 5") on the project page header and optionally the card when milestones exist, completing a milestone writes an activity entry (feeding Step 4 summaries).
- Test: add three milestones, complete one, see "1 of 3" and the activity entry.

## Part C: Memory and Smart Resurfacing

### Step 6: Journal
- `journal_entries`: id, entryDate, bodyMd, source (typed/voice/import), tags[], resurfaceWeight (float default 1.0), lastSurfacedAt?, captureId?, status, createdAt. Multiple entries per day fine. FTS.
- Lives as a Journal section in the Ideas tab, which is renamed **Library** (Ideas + Journal for now; Quotes/Books arrive in a future phase). Reverse-chronological, grouped by date, no calendar heatmap, no empty-day placeholders, no streaks.
- Parser: "journal: ..." and reflective first-person day narration route here. Voice journal is a first-class path.
- Test: voice-capture a journal entry, find it in Library and Search.

### Step 7: Resurfacing Engine
- `resurfacing_seen`: itemType (journal_entry/idea), itemId, surfacedOn, response (kept/dismissed/annotated)?.
- Daily selection (first Today load or midnight cron): one item from journal entries older than 30 days + ideas older than 60 days, weighted by resurfaceWeight, excluding items seen within 90 days.
- Today card, after Tomorrow, styled as kin to the receipt strip: item, age as plain fact, three quiet actions (add a thought, boost, dismiss). Empty pool renders nothing.
- Parser: boost_resurface { item_match }.
- Test: force the job, see a card, dismiss it, force again, see a different item.

### Step 8: Needs Review (smart follow-ups)
- When the parser detects future-facing intent in a capture that is not a datable task ("circle back after the shoot", "revisit this once the trailer sells"), it emits schedule_review { capture_id, review_at | review_condition_text }.
- New `scheduled_reviews` table: id, captureId, reviewAt?, conditionText?, status (pending/surfaced/done/dismissed), createdAt.
- A daily job surfaces due reviews into a "Needs review" group at the top of the Inbox area (plain list, no badges) and, if time-critical, through the existing time-sensitive nudge trigger. Each review row shows the original capture and one-tap outcomes: convert (existing chips), snooze (pick new date), done, dismiss.
- Test: capture "revisit the drone insurance quote in two weeks", confirm a scheduled review lands, force the date, see it in Needs review, convert it to a task.

## Part D: Routines (Section 18 module, activated)

### Step 9: Routines and Completions
- `routines`: id, name, description?, areaId?, schedule (jsonb: frequency daily/weekly/custom days, timeWindow morning/afternoon/evening/anytime), goal (jsonb: e.g. times per week), graceWindow (jsonb), temporary Boolean, startDate?, endDate?, status (active/paused/retired), createdAt. `routine_completions`: id, routineId, completedAt, value?.
- Routines get their own section (inside Tasks tab as a Routines view, or its own tab only if a slot is free; prefer the view). Rows show name, window, and today's state; completing is one tap.
- Today integration: a compact "Routines" line showing today's due routines as plain checkable items. Uncompleted past windows render as nothing tomorrow; no carryover guilt.
- History: per-routine completion history and current run length as plain fact per the streak amendment. Granular parameters honored: windows not times, grace windows, temporary routines that auto-retire at endDate (status change, history kept).
- Routines are fully separate from tasks: no due dates, no overdue state, never in task views or slippage.
- Parser: create_routine, complete_routine ("did my morning stretch").
- Test: create a temporary weekday-morning routine with a 1-day grace window, complete it, skip a day, confirm no red/broken framing anywhere, confirm it auto-retires at endDate with history intact.

## Part E: People (Section 18 module, activated)

### Step 10: People CRM
- Tables per the reference design, adapted: `people` (id, name, relationshipType?, email?, phone?, company?, notesMd?, areaId?, status, createdAt), `person_facts` (id, personId, factType, factValue, dateRelevant?, recurring Boolean, captureId?, createdAt), `person_interactions` (id, personId, interactionType, notesMd?, occurredAt, source manual/calendar/capture, calendarEventId?, captureId?).
- Person pages: facts, interaction timeline, linked captures. A People section in Library (or Settings-adjacent if Library crowds; prefer Library).
- **Calendar integration:** synced events with attendees matching known people log interactions automatically (source calendar, derived, zero entry). Facts with dateRelevant feed the existing time-sensitive nudge trigger (e.g., surfaced two weeks ahead for recurring dates).
- Parser: create_person_fact ("note for Chris: his daughter starts college in August"), log_interaction, create_person.
- Test: capture a fact with a date, confirm the nudge schedules; create a calendar event with a known attendee, confirm an interaction logs itself.

## Part F: Domains and Chat

### Step 11: Domain Pages
- Domain rows in nav become tappable. Domain page: description (markdown, explicit edit action, renders as nothing when empty), then derived aggregation: its areas with latest check-in snippets, active project count and any slipping facts, open task pulse (counts as plain text). No attach actions of any kind exist on a domain.
- Test: open Hobbies, see Ham Radio and Homelab with their latest check-ins, confirm there is no way to add anything to the domain itself.

### Step 12: Data Chat
- A chat surface (top utility area, beside Search) where Matt asks questions of his own data: "what did I journal about the Knoxville shoot", "what's slipping", "what did I say about Chris's daughter". Implementation: thin client over the same capability set as the MCP server (search, read endpoints, all-clear summary); the model composes answers with citations linking to the items. Read-only in v1: chat never mutates data (writes remain capture's job).
- Test: ask three questions spanning journal, tasks, and people; each answer links to real records.

## Step 13: API + MCP Update

Expose everything new to agents: starred, task views/filters, check-ins (list/create/summarize-draft), milestones, journal, resurfacing (read/boost/dismiss), scheduled reviews, routines and completions, people/facts/interactions, domain page aggregates. No delete endpoints anywhere; all agent writes audited in the notifications feed.

## Guardrails

- No resting inputs, prompts, badges, red states, broken-chain streak framing, or auto-hiding anywhere in any step.
- Quick capture speed untouched. Every new capture-routable type flows through the existing bar and parser.
- Pushover remains the delivery channel; native push is noted for later, do not build.
- Nothing from the deferred list (quotes, books, content pipeline, email integration) in this batch.

Final acceptance test: star a task and see it top of Today. Voice-capture a journal entry and "revisit the insurance quote in two weeks". Complete two project tasks, hit AI summarize, post the edited check-in, and see its snippet on the project card with "2 of 3" milestones beside it. Complete a morning routine and skip tomorrow with zero guilt rendering. Capture a fact about a friend with an August date and confirm a scheduled nudge. Open the Hobbies domain page and read the aggregate. Ask chat "what's slipping" and get a cited answer. At no point does any screen ask for anything.
