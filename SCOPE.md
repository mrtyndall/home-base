# Home Base — Personal Operations System

**Owner:** Matt Tyndall
**Version:** 1.0
**Derived from:** Jerad Hill's Personal Operations Dashboard Build Guide v1.0, heavily adapted after requirements interview. Where this document and the original guide conflict, this document wins.

---

## Section 1: Purpose

This system exists to carry mental load. Matt currently keeps tasks, todos, and open loops in his head. That expends constant mental energy and produces background anxiety: the fear of forgetting something. The goal is a system trusted so completely that the brain releases the load. Success looks like kicking your feet up for an afternoon, or taking a vacation, without patrolling your own memory.

This is not a productivity tool measured in completed tasks. It is an external brain measured in mental quiet.

Three consequences flow from this purpose and govern every design decision:

1. **Trust is the product.** The brain only releases what it believes is safely held. One lost capture, one stale display, one completed task still showing open, and the brain resumes patrol duty. Accuracy and integrity outrank every feature.
2. **The all-clear is a feature, not an absence.** An empty list does not relieve anxiety, because the brain cannot distinguish "nothing is due" from "the system does not know about the thing." The system must affirmatively state clearance: "Nothing due through Sunday. Next commitment Monday 10:00am. Nothing slipping." This is the most valuable pixel in the app.
3. **The system maintains, Matt decides.** The system does all sorting, aging, syncing, and surfacing so every view is accurate with zero gardening. It never deletes, expires, hides, or auto-archives anything. Items leave only by Matt's explicit action, and even then remain searchable forever.

## Section 2: What This Is and Is Not

**Is:** A single-user, self-hosted web app (PWA) holding Matt's personal tasks, calendar, areas, projects, side quests, ideas, and captures. Voice and typed capture through one door, parsed by Claude into structured data.

**Is not:**

- A work tool. Priceless Misc production work lives in Production Hub. This system is the personal-life counterpart, with one small read-only bridge (Section 9).
- A coach. It observes, holds, and surfaces. It never advises, scores, or shames.
- A note-taking or PKM system. Obsidian remains separate. This system may export markdown to the vault later, but never depends on it.
- Multi-user. Solo, permanently.

## Section 3: Design Principles

These are non-negotiable and should be treated as acceptance criteria for every feature.

| Principle | Meaning in practice |
|---|---|
| Nothing is ever lost | Every capture is written to a raw, append-only ledger before parsing. Parsing failures, misfiles, and ambiguity never destroy the original input. Search must be able to find any capture ever made. Search failure equals data loss. |
| One-strike accuracy | A single instance of wrong or stale information kills trust. Completed means gone from active views instantly. Counts match reality. Calendar reflects Google within its sync window and displays last-synced time. |
| Speed is trust | Usage is dozens of 15 to 30 second glances per day, competing with Messages and Mail for thumb access. Cold open to usable Today screen must be fast. Capture must be near-instant: open, type or speak, send, confirmed. |
| Plain visibility, no guilt | Neglected items stay visible in their normal place. No badges, no age labels, no red counters, no "you haven't touched this in 14 days" callouts. Matt will notice. Dormant is not failure. |
| Confirmation builds trust | Every capture returns a visible confirmation of what was created and where it landed. The Today screen shows a "recently captured" strip as ongoing proof of catch. |
| Surfaces never ask | Derived beats declared. No resting screen, card, or list renders an empty input, placeholder, or prompt soliciting information. Optional empty fields render as nothing. Card/list facts are computed from existing data such as tasks, activity, notes, and timestamps instead of demanded from Matt. A view that asks every time it is seen creates mental load and is a trust violation on par with guilt mechanics. |
| Designed, not utilitarian | The app should look and feel intentionally designed. Matt cares about visual quality. No admin-panel defaults. Visual direction is a build-time conversation, but the bar is "something you'd want to look at." |
| Event-driven attention | Push notifications fire on exactly two triggers (Section 8). Never on a schedule. No daily digests. The app's presence on the home screen is the primary pull. |

## Section 4: The Three Pillars

**Guardrail for agentic builders:** the pillar weighting below governs build order and feature depth, nothing else. It is not an architecture, a module boundary, or a quality tier. Every table gets identical integrity guarantees, every screen meets the same design bar, and "secondary" never means stubbed, half-tested, or visually neglected. Do not organize the codebase around pillar language. If you find yourself cutting quality on a lower pillar and citing this section, you have misread it.

### Pillar 1 — Tasks and Calendar (Primary)

This is where the mental load lives and where the system succeeds or dies. It is built first and specified deepest, and the Today screen serves it above all else.

**Tasks:**
- Title, notes, status, due date, optional due time, priority
- Area assignment, required, defaulting to the Inbox system area
- Optional project assignment; a project implies its area
- Subtasks (parent_task_id)
- Recurrence (RRULE)
- Reminders (offset array, delivered via Pushover and in-app)
- Someday flag for dateless, aspirational tasks shown only in the Tasks tab's Someday section and on their parent area/project, never on Today
- Source tracking (typed, voice, shortcut, manual)
- Completion is instant and absolute: completed tasks disappear from active views immediately and remain searchable forever

**Calendar:**
- Two-way Google Calendar sync on a 15-minute cron (never on page load, per the original guide's rate-limit lesson)
- Last-synced timestamp visible on the Today screen
- Events creatable via capture ("dinner with Lauren Friday 7pm")

**The Today screen (the home base):**
- Time horizon: today plus tomorrow. Not now/next, not the week.
- Contents, in order: all-clear or attention status line, today's calendar, tasks due today/overdue, tomorrow preview, recently captured strip
- The all-clear state renders prominently when nothing is due and nothing is slipping, stating the facts positively including the next upcoming commitment
- Overdue and long-open items appear in their normal position with no special guilt treatment
- Strict item ceiling to stay glanceable ("capture liberal, display conservative," kept from the original guide)

### Pillar 2 — Areas, Projects, Hobbies, and Side Quests

Personal areas and projects (ham radio, car upkeep, homelab builds, solar research, hobby threads) die from expensive re-entry, not lost interest. After weeks away, reconstructing "where was I?" costs more than the next step itself. This pillar makes re-entry a ten-second read.

**Every area and project can carry living state:**
- `current_state`: one or two sentences, describing exactly where things stand when the system has real state to record
- `next_step`: the single next physical action, when one has been captured or explicitly set
- Both are optional, never prompted for on resting views, and updated through the capture door or an explicit edit action: "log on the Proxmox build: motherboard arrived, next step is rack rails" updates both fields and appends to the activity log
- Activity logs preserve full history of state changes and log entries

**Areas are ongoing responsibilities:**
- Areas are fuzzy, durable responsibilities with no finish line. Examples: Ham Radio under Hobbies, Car Upkeep under Home.
- Areas hold tasks, projects, notes, docs, file attachments, linked ideas, current_state, next_step, and activity.
- Lifecycle is `active`, `parked`, or `retired`. These are statuses, never deletes.
- Areas have no target date, no completed state, no milestones, and never appear in slipping logic.
- Optional tending cadence surfaces as plain fact only, never as a nag.

**Projects are finishable:**
- Every project belongs to exactly one area.
- Projects hold tasks, notes, docs, file attachments, linked ideas, current_state, next_step, activity, optional milestones, target_date, completion, slipping logic, and idea lineage.

**Project status model:**
- `someday` — wanted, not committed. A full container that can incubate ideas, docs, and tasks indefinitely. No target date required. Excluded from slipping.
- `active` — currently being worked.
- `parked` — started, consciously set down. Parked is a normal, healthy state, not a warning. Excluded from slipping.
- `completed` and `killed` — explicit, Matt-only status changes. Killed projects stay searchable with their full history.
- Status flow enforcement in UI: "start now" versus "someday" is offered at creation; park appears only on active projects. Never present someday and parked as a pick-one dropdown in the same moment. Any status is correctable later from the project detail view.

**Views:**
- A projects shelf grouped into Active, Someday, and Parked. Cards surface derived facts: name, domain/area, next dated task or open-task count, last touched, and fresh note snippets. Optional current_state renders only when it exists.
- Area re-entry view: open an area and immediately see optional state, standing tasks, child projects, notes, docs, attachments, linked ideas, and recent activity without being prompted to fill anything in.
- Project re-entry view: open a project and immediately see optional state, tasks, notes, docs, attachments, linked ideas, milestones when present, and recent activity without being prompted to fill anything in.

**Slipping (feeds the nudge system):** an `active` project with a target date approaching and no activity, or an active project untouched beyond a per-project threshold. Someday and parked projects never slip. Areas never slip. Thresholds are tunable per project.

### Pillar 3 — Ideas (Secondary)

Ideas get a home and a conversion path: capture, hold, convert. Deliberately lean in feature count, built to the same quality bar as everything else. Leanness here is a scope decision, not a quality one.

- Ideas live in their own tab, visited intentionally when in that headspace. No Today screen real estate.
- States: `seed` → `developing` → `converted` or `killed`. No forcing functions, no ripeness timers. Matt decides when an idea is ripe.
- One-tap conversion: idea → task or idea → project, preserving lineage (converted items link back to the original idea and capture)
- Ideas can accumulate appended thoughts over time via capture ("add to the podcast intro idea: ...")
- Killed ideas remain searchable forever

## Section 5: Capture System

One door, every source, nothing lost.

**Flow:**
1. Input arrives: in-app text field (default focus), in-app mic (Web Speech API), or mobile shortcut POST to `/api/capture`
2. Raw input is written to the `captures` ledger immediately, before any parsing. This write is the sacred step. If everything downstream fails, the capture survives.
3. Backend calls the Claude API with the parser system prompt (Section 10) and current context
4. Parser returns structured actions; server executes them and links created items back to the capture record
5. UI shows confirmation: what was created and where it landed ("Task created in Ham Radio, due Friday"). Mobile shortcuts receive a spoken/text confirmation.
6. Ambiguous or unclassifiable parses remain pending captures in the Inbox: visible raw text with conversion affordances, never manufactured tasks.

**Parsing disposition:** classify, never coerce. Clear action intent creates tasks; thoughts and possibilities create ideas; facts, links, and recommendations create references or notes; project/area narration logs activity or notes. Ambiguous input remains a pending Inbox capture with its raw text intact and no derived entity. Matt can convert it later with one tap after choosing a destination. Never let Inbox become a triage obligation.

**Both input modes ship together.** Text field and mic sit side by side on every screen via a persistent capture affordance. Typing for when people are around, voice for the truck and home. No mode selection, both always present.

**Mobile shortcuts (iOS Shortcuts, Android HTTP Shortcuts):** per the original guide's Section 8 pattern, with capture tokens scoped to POST `/api/capture` only, rate-limited, revocable. Stable domain name required so shortcuts never silently break.

## Section 6: Search and Retrieval

Search is a data-integrity feature, not a convenience. To Matt, a capture that cannot be found is a lost capture, and lost captures break the entire value proposition. All three modes ship:

1. **Instant keyword filter** — results appear as you type, across all item types including raw captures, completed, killed, and parked items. Fast full-text (Postgres FTS).
2. **Chat-style questions** — "what was that idea about the podcast intro?" answered by Claude querying the database. Same API, retrieval instead of parsing.
3. **Browse** — by domain, area, type, and project. Search as backup, structure as primary.

Nothing is excluded from search. Ever.

## Section 7: Hierarchy, Areas, and Portable Content

Matt thinks in life areas, but the system needs one clear meaning per level. The hierarchy is:

**Domains -> Areas -> Projects -> Tasks.**

Nesting is capped here permanently. There are no sub-areas and no sub-projects; subtasks cover task-level decomposition. Enforce this structurally: no self-referencing parent columns on areas or projects.

**Domains are pure organization.** They hold no tasks, no projects, no notes, no state, and no lifecycle. They exist only to group areas in navigation and pickers. Domains are never parked, completed, or killed. Target 4 to 7, such as Home, Family, Health, Hobbies, and Creative. Work is deliberately absent; work lives in Production Hub.

**Areas are ongoing responsibilities.** Areas are PARA-style responsibilities with no finish line. Examples: Ham Radio under Hobbies, Car Upkeep under Home. Areas hold tasks, projects, notes, docs, file attachments, linked ideas, current_state, next_step, and activity. Area lifecycle is `active`, `parked`, and `retired`; all are statuses, never deletes. Areas have no target_date, no completed state, no milestones, and never appear in slipping logic. Optional tending_cadence surfaces as plain fact only, never as a nag.

**Projects are finishable.** Every project belongs to exactly one area. Projects hold tasks, notes, docs, file attachments, linked ideas, current_state, next_step, activity log, target_date, optional milestones, completion, slipping logic, and idea lineage.

**Project statuses:** `someday`, `active`, `parked`, `completed`, and `killed`.

- `someday` means wanted, not committed. A someday project is a full container that can incubate ideas, docs, and tasks indefinitely. It requires no target date and is excluded from slipping.
- `parked` means started, consciously set down. It is guilt-free and excluded from slipping.
- `completed` and `killed` are explicit status changes, never deletes. Killed items stay searchable forever.
- Status flow enforcement in UI: creation offers "start now" versus "someday"; park appears only on active projects. Never present someday and parked as a pick-one dropdown in the same moment. Any status is correctable later from project detail.

**Tasks** attach to an area or a project; a project implies its area. Tasks never attach directly to a domain. Tasks can be marked someday: dateless, aspirational, shown only in the Tasks tab's Someday section and on their parent area/project, never on Today.

**Inbox is a system area** under a hidden system domain. Quick-add and unrouted captures land there. Inbox remains visible and first-class, never a hidden queue and never a guilt pile. It is the only catch-all; do not auto-create "General" areas per domain.

**Litmus test for UI copy, agents, and the parser prompt:** if it can be finished, it is a project. If Matt would still be responsible for it a year from now regardless, it is an area. If it is just a category of life, it is a domain. Someday means wanted, not committed; parked means started, set down.

**Markdown is canonical.** All text-bearing content (notes, docs, idea bodies, state fields) is stored as plain markdown, rendered in-app, and edited as markdown with a simple editor plus preview. No proprietary rich-text format anywhere. This preserves portability, full-text search, agent-friendliness, and a future Obsidian export path as a plain file write.

**Container symmetry rule.** Areas and projects share the identical container set: tasks, notes, docs, attachments, linked ideas, current_state, next_step, and activity log. The only differences are lifecycle and project-specific finishable features. Projects have target_date, milestones, completion, slipping, and idea lineage. Areas have tending_cadence and retired status. Implement shared containers once; do not let area and project pages drift.

## Section 8: Notifications and Nudges

**In-app:** a notifications feed logging every system action (audit trail, undo where feasible). Reminders for tasks with reminder offsets.

**Push (Pushover), exactly two triggers:**
1. **Clustering** — several related captures have piled up around the same theme. Requires the parser to tag captures with topical embeddings or theme labels and a nightly job to detect clusters. Threshold tunable; start conservative.
2. **Time-sensitive capture becoming actionable** — something captured with a temporal condition has reached its window ("when the RT-EV pilot billing cycle starts...", "before the July trip...").

Explicitly excluded: scheduled digests, streak reminders, "you haven't opened the app" pings, guilt nudges of any kind. Slipping projects surface on the Today status line and projects shelf, not as pushes, unless a target date makes them time-sensitive (trigger 2).

## Section 9: Production Hub Bridge

Minor convenience, read-only. When a work item spawns a personal project ("I want to build a personal tool inspired by the SAP shoot workflow"), the app can look up Production Hub projects via its existing MCP/API and pre-populate name and context. No write-back, no sync, no dependency. Build late, keep tiny.

## Section 10: Voice/Text Parser

Adapted from the original guide's Section 7. The parser receives raw input plus context and returns a JSON array of actions.

**Context per request (rebuilt fresh every request, never cached as content):**
- Current date/time, America/New_York
- Active domains and areas as a tree (IDs, names, status)
- Active, someday, and parked projects (IDs, names, area, current_state)
- Recent ideas (last 60 days, IDs and titles)
- Capture source

**Action types:**
- `create_task` { area_match?, project_match?, title, due_date?, due_time?, priority?, parent_task_match?, reminder_offsets?, someday? }
- `complete_task` { task_match }
- `create_area` { name, domain_match }
- `update_area_state` { area_match, current_state?, next_step?, status?, log_entry? }
- `create_project` { name, area_match, target_date?, status? }
- `update_project_state` { project_match, current_state?, next_step?, log_entry?, status? }
- `create_calendar_event` { title, start, end, location? }
- `create_idea` { title, body?, area_match?, project_match?, tags? }
- `append_to_idea` { idea_match, body }
- `convert_idea` { idea_match, to: task|project, ...target fields }
- `create_reference` { body, tags?, area_match?, project_match?, related_match? }
- `create_entity_note` { parent_type: area|project, area_match?, project_match?, body_md }
- `create_entity_doc` { parent_type: area|project, area_match?, project_match?, title, body_md }

**Rules (kept and adapted from the guide):**
- Return only valid JSON, array of actions, multiple actions per utterance common
- Fuzzy matching on names
- Ambiguity returns `{ needs_disambiguation: true, candidates: [...] }` → Inbox
- Unparseable input returns an error object → Inbox with raw text intact
- No area or project named → Inbox system area
- Area and project routing follow the litmus test in Section 7: finishable is project, durable responsibility is area, category is domain
- "Someday project" creates a project with status `someday`; "someday task" creates a task with `someday = true`
- "Parked" means started and set down; "someday" means wanted and not committed. The parser must not use them interchangeably.
- Date phrases resolve to ISO in America/New_York
- Prompt caching on the static portion of the system prompt; Sonnet for parsing, Haiku for cheap routes

## Section 11: Architecture and Stack

Kept from the original guide except where noted.

| Layer | Choice | Deviation from guide |
|---|---|---|
| Frontend | Next.js (App Router) PWA, mobile-first, bottom tabs | Same |
| Backend | Node.js (Fastify or Hono) | Same |
| Database | PostgreSQL on Railway | **Changed from Supabase.** Matt already runs Production Hub on Railway. One platform, one deploy habit, saves $25/month. |
| Object storage | Railway volume or Cloudflare R2 (photos/attachments, light use) | Changed from Supabase Storage |
| Auth | Single-user: strong password + long-lived session, optional TOTP. Simple middleware, no auth SaaS. | Changed from Supabase Auth |
| AI | Anthropic API, Sonnet + Haiku, prompt caching | Same |
| Push | Pushover | Same (was optional in guide, required here) |
| Hosting | Railway | Confirmed |
| Calendar | Google Calendar API, OAuth via Google Cloud Console, 15-min cron sync | Same |

**Tabs:** Today · Tasks · Projects · Ideas · Search. Persistent capture affordance on every tab.

## Section 12: Data Model

Claude Code generates migrations from this. Adapted from the guide's Section 6. Health and inventory module tables are dropped entirely. Content pipeline, people CRM, email rules, and routines tables are retained in scope but live in Section 18 and are migrated only when their module is activated. Do not create them speculatively.

```
captures                  — Append-only raw ledger. THE sacred table.
  id, raw_text, source (in_app_text/in_app_voice/ios_shortcut/
  android_shortcut/api), device_context (jsonb),
  parse_status (parsed/ambiguous/failed),
  parsed_actions (jsonb), created_items (jsonb refs),
  created_at
  — Never updated destructively, never deleted.

domains                   — Pure organization headers
  id, name, description, sort_order, is_system (bool), active
  — Hold no tasks, projects, notes, state, or lifecycle.

areas                     — Ongoing responsibilities
  id, name, domain_id, status (active/parked/retired),
  current_state (markdown), next_step (markdown),
  tending_cadence?, sort_order, is_system (bool),
  created_at, updated_at
  — No target_date, no completed state, no milestones, no slipping logic.

projects                  — Finishable outcomes
  id, name, area_id, status (someday/active/parked/completed/killed),
  current_state (markdown), next_step (markdown),
  target_date?, slip_threshold_days (default per settings),
  parked_at?, completed_at?, killed_at?, created_at

project_activity          — Append-only project history
  id, project_id, entry, state_snapshot (jsonb),
  source, capture_id?, created_at

tasks
  id, title, notes, status (open/completed/killed),
  due_date?, due_time?, priority?,
  area_id (required, FK, Inbox area default),
  project_id? (project implies same area), parent_task_id?,
  someday (bool default false),
  recurrence_rule?, reminder_offsets (jsonb),
  source, capture_id?, created_at, completed_at?

ideas                     — Pillar 3
  id, title, body (markdown), area_id?, project_id?, tags[],
  status (seed/developing/converted/killed),
  converted_to_type?, converted_to_id?,
  capture_id?, created_at, updated_at

idea_notes                — Appended thoughts over time
  id, idea_id, body, capture_id?, created_at

references                — Links, recs, things people mention
  id, body, url?, tags[], area_id?, project_id?,
  related_type?, related_id?, capture_id?, created_at

entity_notes              — Shared area/project notes
  id, parent_type (area/project), parent_id,
  body_md, source?, capture_id?, created_at

entity_docs               — Shared area/project markdown docs
  id, parent_type (area/project), parent_id,
  title, body_md, status (active/archived),
  source?, capture_id?, created_at, updated_at

documents                 — File attachment metadata
  id, parent_type (area/project), parent_id,
  filename, r2_key, mime, size, created_at

milestones                — Project-only checklist
  id, project_id, title, status, sort_order, completed_at?

calendar_events
  id, google_event_id, title, start, end, location?,
  synced_at, source

notifications             — In-app audit feed
  id, type, title, body, source_ref, status,
  undo_payload (jsonb)?, created_at

nudges                    — Push audit
  id, trigger (clustering/time_sensitive), title, body,
  supporting_data (jsonb), sent_at, acted_on?

capture_tokens
  id, token_hash, label, device_name,
  rate_limit_per_hour, last_used_at?, revoked_at?

app_settings
  id, key, value (jsonb), updated_at
```

**Integrity rules:**
- No hard deletes anywhere except capture_tokens revocation. "Killed" and "completed" are statuses.
- Every AI-created row links back to its capture_id.
- Postgres FTS indexes on captures.raw_text, tasks.title+notes, ideas, references, project_activity, entity_notes.body_md, and entity_docs.title+body_md.
- Nightly automated backup of the full database to off-Railway storage (R2 or local pull). Non-negotiable given the trust requirement.
- No self-referencing parent columns on areas or projects. Hierarchy stops at Domains -> Areas -> Projects -> Tasks.

## Section 13: Implementation Sequence

This is one holistic design. The sequence below is engineering order, not a product roadmap; nothing here is optional or deferred-indefinitely.

1. **Foundation:** Railway project, Postgres, migrations, auth, backup job
2. **The sacred path:** captures ledger + `/api/capture` + parser + confirmation. Capture must work before anything else looks good.
3. **Tasks + hierarchy + Inbox area** with full CRUD, recurrence, reminders
4. **Today screen** including the all-clear state and recently captured strip
5. **Google Calendar sync** with visible sync timestamp
6. **Search**, all three modes
7. **Projects/side quests** with living state, parked status, activity log
8. **Ideas tab** with convert flow
9. **Pushover nudges:** time-sensitive trigger first, clustering second
10. **Mobile shortcuts** (iOS + Android) with capture tokens
11. **Production Hub read-only bridge**
12. **Design pass:** the app already works; now make it something worth looking at
13. **Retained modules (Section 18):** activated one at a time, only after the felt-gap test passes

Use the tool daily from step 4 onward. Tune against real use before adding steps 9+.

## Section 14: Costs

| Item | Monthly |
|---|---|
| Railway (app + Postgres) | ~$10–20 |
| Anthropic API (parsing + chat search) | ~$10–15 |
| Pushover | $5 one-time |
| Domain | ~$1 amortized |
| **Total** | **~$21–36/month** |

Roughly $25–50/month cheaper than the original guide's stack, primarily from dropping Supabase Pro.

## Section 15: Success Criteria

Evaluate at 30 and 90 days, in priority order:

1. **Matt has stopped keeping tasks in his head.** The felt sense of "I don't have to remember this" is the primary metric.
2. Ideas are converting to projects/tasks instead of dying uncaptured.
3. Opening the app is as reflexive as opening Messages.
4. Zero trust violations: no lost captures, no stale displays, no wrong counts.
5. At least one afternoon or trip taken with a glance at the all-clear and a genuine exhale.

Failure signals: Inbox becoming a guilt pile, gardening required to keep views accurate, any capture ever going missing.

## Section 16: Open Decisions (Resolve at Kickoff)

1. Cloudflare R2 for file attachments versus Railway volume
2. Final domain list (target 4 to 7) and initial areas under each
3. Clustering nudge threshold and theme-detection approach (start conservative)
4. Visual direction: designed and calm vs. designed and bold
5. Parked-project weighting: is the pain of dead projects mostly lost context, lost visibility, or too many open threads? (Interview left this unresolved; affects how prominent the projects shelf is.)
6. Whether references get their own tab or live under Search/browse only
7. Confirm Inbox remains the only catch-all; no per-domain "General" areas

## Section 17: Kickoff Prompt for Claude Code

```
I am building a personal operations system following the SCOPE.md in this
directory. Read SCOPE.md fully before we begin. This scope was produced
from a detailed requirements interview; do not re-litigate decisions it
records. Section 3 (Design Principles) and Section 12's integrity rules
are acceptance criteria for every feature.

Rules for our work together:

- Follow the implementation sequence in Section 13. The captures ledger
  and /api/capture endpoint come before any UI polish.
- The captures table is append-only and sacred. No code path may ever
  destroy or fail to persist a raw capture.
- No hard deletes. No auto-expiry. No auto-archive. No badges or age
  labels on neglected items.
- Use the data model in Section 12. Do not invent tables without asking.
- Commit to git after each working piece with a clear message.
- Write code I can read and modify. Comment non-obvious decisions.
- When something is unclear, ask. Do not guess.
- Before we write code, walk me through the Open Decisions in Section 16
  and record my answers at the top of a DECISIONS.md file.
- Set up the nightly database backup in step 1, not later.
- Pillar weighting (Section 4) governs build order and depth only. Never
  cut quality, testing, or design on a lower pillar and cite the scope.
- Section 18 modules exist in scope but are not built, migrated, or
  scaffolded until I explicitly activate one after the felt-gap test.
  Do not propose them proactively.

I run Production Hub on Railway already and am comfortable with Railway
deploys, git, and terminals. Explain non-obvious architecture choices
but skip beginner explanations.

Start by reading SCOPE.md, then Section 16.
```

## Section 18: Retained Modules (In Scope, Biased Against Early Builds)

These four modules from the original guide stay in scope. The bias: none of them get built until the core system (steps 1 through 12) is in daily use AND Matt has felt the specific gap for at least two consecutive weeks. When one activates, it inherits every design principle in Section 3 and gets a short written spec before code. One module at a time.

**Activation test, applied per module:** "I have concretely wished for this at least weekly for two weeks, and the core system could not serve the need." A vague "this would be nice" fails the test.

### Content Pipeline
Tracks personal creative output (The Misc podcast, blog, doc projects) from idea → outline → production → published → derivatives. On publish, auto-spawns derivative tasks from per-channel templates. Tables: `content_items`, `content_templates` per the original guide. Likeliest first activation given the ideas-to-projects success metric.

### People CRM
Light personal relationship memory: facts people mention (anniversaries, kids' names, follow-ups), surfaced ahead of relevant dates. Captured through the same door ("note for Chris: his daughter starts college in August"). Tables: `people`, `person_facts`, `person_interactions`. Nudges from this module use the existing time-sensitive trigger only; no new notification types.

### Email Integration
Forward-to-capture address first; Gmail watcher with autonomous actions only after forward-to-capture has proven itself. Approval-first trust model on any autonomous action, per the original guide's security warning. Table: `email_rules`. The bias against this one is strongest: it is the only module that acts on Matt's behalf in external systems, and a wrong action there is a trust violation under the one-strike rule.

### Routines
Recurring habits separate from tasks, with completion history. Explicitly excluded until activated: streaks, heatmaps, and any mechanic that manufactures guilt on a missed day. Tables: `routines`, `routine_completions`. Weakest activation candidate; recurrence on tasks may cover the need entirely.

---

*End of scope. When reality diverges from this document, update the document. It only stays useful if it stays true.*
