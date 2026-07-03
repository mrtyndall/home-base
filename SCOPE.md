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

**Is:** A single-user, self-hosted web app (PWA) holding Matt's personal tasks, calendar, projects, side quests, ideas, and captures. Voice and typed capture through one door, parsed by Claude into structured data.

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
| Designed, not utilitarian | The app should look and feel intentionally designed. Matt cares about visual quality. No admin-panel defaults. Visual direction is a build-time conversation, but the bar is "something you'd want to look at." |
| Event-driven attention | Push notifications fire on exactly two triggers (Section 8). Never on a schedule. No daily digests. The app's presence on the home screen is the primary pull. |

## Section 4: The Three Pillars

**Guardrail for agentic builders:** the pillar weighting below governs build order and feature depth, nothing else. It is not an architecture, a module boundary, or a quality tier. Every table gets identical integrity guarantees, every screen meets the same design bar, and "secondary" never means stubbed, half-tested, or visually neglected. Do not organize the codebase around pillar language. If you find yourself cutting quality on a lower pillar and citing this section, you have misread it.

### Pillar 1 — Tasks and Calendar (Primary)

This is where the mental load lives and where the system succeeds or dies. It is built first and specified deepest, and the Today screen serves it above all else.

**Tasks:**
- Title, notes, status, due date, optional due time, priority
- Domain (life area) assignment, required, defaulting to Inbox
- Optional project assignment
- Subtasks (parent_task_id)
- Recurrence (RRULE)
- Reminders (offset array, delivered via Pushover and in-app)
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

### Pillar 2 — Projects, Hobbies, and Side Quests

Personal projects (homelab builds, radio work, solar research, hobby threads) die from expensive re-entry, not lost interest. After weeks away, reconstructing "where was I?" costs more than the next step itself. This pillar makes re-entry a ten-second read.

**Every project carries living state:**
- `current_state`: one or two sentences, always current, describing exactly where things stand
- `next_step`: the single next physical action
- Both updated through the capture door: "log on the Proxmox build: motherboard arrived, next step is rack rails" updates both fields and appends to the activity log
- Activity log preserves full history of state changes and log entries

**Status model:**
- `active` — currently being worked
- `parked` — consciously dormant, guilt-free, fully preserved. Parked is a normal, healthy state, not a warning. Parked projects are excluded from slipping detection entirely.
- `completed` and `killed` — explicit, Matt-only actions. Killed projects stay searchable with their full history.

**Views:**
- A projects shelf grouped by domain, each card showing name, status, current_state, and next_step at a glance
- Re-entry view: open a project and immediately see where you left off, the next step, and recent activity

**Slipping (feeds the nudge system):** an `active` project with a target date approaching and no activity, or an active project untouched beyond a per-project threshold. Parked projects never slip. Thresholds are tunable per project.

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
5. UI shows confirmation: what was created and where it landed ("Task created in Home, due Friday"). Mobile shortcuts receive a spoken/text confirmation.
6. Ambiguous parses land in the Inbox: a visible, first-class holding area, never a hidden queue. Inbox items are complete captures awaiting routing, not degraded data.

**Parsing disposition:** auto-file with best guess and visible confirmation. Matt corrects misfiles when he sees them; search guarantees misfiles are always recoverable. Inbox is reserved for genuine ambiguity only. Never let Inbox become a triage obligation.

**Both input modes ship together.** Text field and mic sit side by side on every screen via a persistent capture affordance. Typing for when people are around, voice for the truck and home. No mode selection, both always present.

**Mobile shortcuts (iOS Shortcuts, Android HTTP Shortcuts):** per the original guide's Section 8 pattern, with capture tokens scoped to POST `/api/capture` only, rate-limited, revocable. Stable domain name required so shortcuts never silently break.

## Section 6: Search and Retrieval

Search is a data-integrity feature, not a convenience. To Matt, a capture that cannot be found is a lost capture, and lost captures break the entire value proposition. All three modes ship:

1. **Instant keyword filter** — results appear as you type, across all item types including raw captures, completed, killed, and parked items. Fast full-text (Postgres FTS).
2. **Chat-style questions** — "what was that idea about the podcast intro?" answered by Claude querying the database. Same API, retrieval instead of parsing.
3. **Browse** — by domain, by type, by project. Search as backup, structure as primary.

Nothing is excluded from search. Ever.

## Section 7: Domains

Matt thinks in life areas. Initial domain list to confirm at kickoff, drawn from: Home, Family, Health, Creative, Hobbies/Homelab, plus the system Inbox. Target 5 to 8. Work is deliberately absent; work lives in Production Hub.

Kept from the original guide: build the final domain model from the start (Domains → Projects → Tasks, Inbox as catch-all system domain, no "Areas" concept).

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
- Active domains (IDs, names)
- Active and parked projects (IDs, names, domain, current_state)
- Recent ideas (last 60 days, IDs and titles)
- Capture source

**Action types:**
- `create_task` { domain_match?, project_match?, title, due_date?, due_time?, priority?, parent_task_match?, reminder_offsets? }
- `complete_task` { task_match }
- `create_project` { name, domain_match, target_date? }
- `update_project_state` { project_match, current_state?, next_step?, log_entry?, status? }
- `create_calendar_event` { title, start, end, location? }
- `create_idea` { title, body?, domain_match?, tags? }
- `append_to_idea` { idea_match, body }
- `convert_idea` { idea_match, to: task|project, ...target fields }
- `create_reference` { body, tags?, related_match? }

**Rules (kept and adapted from the guide):**
- Return only valid JSON, array of actions, multiple actions per utterance common
- Fuzzy matching on names
- Ambiguity returns `{ needs_disambiguation: true, candidates: [...] }` → Inbox
- Unparseable input returns an error object → Inbox with raw text intact
- No domain named → Inbox
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

domains                   — Life areas
  id, name, description, sort_order, is_system (bool), active

projects                  — Pillar 2
  id, name, domain_id, status (active/parked/completed/killed),
  current_state (text), next_step (text),
  target_date?, slip_threshold_days (default per settings),
  parked_at?, completed_at?, killed_at?, created_at

project_activity          — Append-only project history
  id, project_id, entry, state_snapshot (jsonb),
  source, capture_id?, created_at

tasks
  id, title, notes, status (open/completed/killed),
  due_date?, due_time?, priority?,
  domain_id (required, FK, Inbox default),
  project_id?, parent_task_id?,
  recurrence_rule?, reminder_offsets (jsonb),
  source, capture_id?, created_at, completed_at?

ideas                     — Pillar 3
  id, title, body, domain_id?, tags[],
  status (seed/developing/converted/killed),
  converted_to_type?, converted_to_id?,
  capture_id?, created_at, updated_at

idea_notes                — Appended thoughts over time
  id, idea_id, body, capture_id?, created_at

references                — Links, recs, things people mention
  id, body, url?, tags[], domain_id?,
  related_type?, related_id?, capture_id?, created_at

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
- Postgres FTS indexes on captures.raw_text, tasks.title+notes, ideas, references, project_activity.
- Nightly automated backup of the full database to off-Railway storage (R2 or local pull). Non-negotiable given the trust requirement.

## Section 13: Implementation Sequence

This is one holistic design. The sequence below is engineering order, not a product roadmap; nothing here is optional or deferred-indefinitely.

1. **Foundation:** Railway project, Postgres, migrations, auth, backup job
2. **The sacred path:** captures ledger + `/api/capture` + parser + confirmation. Capture must work before anything else looks good.
3. **Tasks + domains + Inbox** with full CRUD, recurrence, reminders
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

1. Final domain list (target 5 to 8)
2. Clustering nudge threshold and theme-detection approach (start conservative)
3. Visual direction: designed and calm vs. designed and bold
4. Parked-project weighting: is the pain of dead projects mostly lost context, lost visibility, or too many open threads? (Interview left this unresolved; affects how prominent the projects shelf is.)
5. Whether references get their own tab or live under Search/browse only

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
