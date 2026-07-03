# Personal Operations Dashboard — Build Guide

A complete scope document for building your own self-hosted personal operations dashboard with voice-first capture, AI parsing, and modular feature support.

**Author:** Jerad Hill ([jeradhill.com](https://jeradhill.com) · [Field Notes Substack](https://fieldnotes.substack.com))
**Version:** 1.0
**License:** Reference architecture. You may use this guide and any code you generate from it for personal purposes. Not a supported product.

---

## What This Is

A complete reference architecture for building a personal operations dashboard — a single web app that holds your tasks, projects, calendar, notes, journal, and any other operational data you need to keep your life running. The defining feature is voice-first capture: you speak to the system, AI parses what you said into structured data, and it lands in the right place automatically.

This document gives you everything needed to build it yourself using Claude Code. It is opinionated, complete, and honest about what works and what doesn't.

## What This Is NOT

Before going further, be clear about what you're building:

- **Not a productivity coach.** The tool does not give advice, interpret your feelings, or counsel you on direction. It observes, captures, and surfaces information. You decide what to do with it.
- **Not a replacement for human relationships, therapy, or spiritual practice.** It's an external memory and operational layer. Use it accordingly.
- **Not a SaaS or commercial product.** This is a single-user self-hosted tool. Multi-tenant is out of scope.
- **Not finished software.** Build it for yourself, in stages, and adapt it. You will rebuild parts of it. That's the point.

If you want a polished commercial tool, buy Todoist, Notion, or similar. If you want to own your operational system and have it work the way *you* think, build this.

---

## Who This Is For

This guide assumes you are:

- Comfortable running commands in a terminal
- Willing to spend $35–55/month on infrastructure
- Willing to invest 40–80 hours over several weeks to build it
- Frustrated enough with fragmented existing tools to want something different

You do not need to be a professional developer. Claude Code does most of the actual coding. You need to be able to read what it writes, run commands, and troubleshoot when things break.

---

## Section 1: Prerequisites

### Required Accounts and Subscriptions

| Service | Purpose | Cost |
|---|---|---|
| Claude Pro or Max plan | Required to use Claude Code. Pro is the entry point. Max if you find yourself hitting limits. | $20–200/month |
| Anthropic API account | Powers the voice parser and chat queries in your dashboard. Separate from Claude.ai subscription. | Pay-as-you-go (~$10–25/month at moderate use) |
| Supabase Pro plan | Database, file storage, and auth. The free tier auto-pauses after a week of inactivity, which is a dealbreaker for a daily-use tool. | $25/month |
| A cloud host | Runs the Node.js backend and Next.js frontend. Options listed below. | $5–25/month |
| GitHub account | Source control. Free tier is fine. | Free |
| Google Cloud Console | OAuth credentials for Calendar and Gmail integration | Free |
| Domain name (optional but recommended) | Stable URL for mobile shortcuts | $10–15/year |

**Hosting options:**

- **xCloud, Railway, Render, or Fly.io** — managed Node.js hosting from Git push. Recommended for ease of use.
- **A VPS (DigitalOcean, Linode, Hetzner)** — cheaper but requires more setup. Use if you're comfortable managing a Linux server.
- **Your own NAS (Synology, etc.) with Docker** — viable but exposes you to home power/internet issues.

**Optional services:**

- **Pushover** ($5 one-time per platform) — push notifications to phone/desktop. Highly recommended.
- **Readwise** ($10/month) — if you want to import existing Kindle highlights into the system.

### Required Tools (Free)

- **Node.js 18 or later** — the runtime
- **pnpm or npm** — package manager
- **Git** — source control
- **Claude Code** — installed via `npm install -g @anthropic-ai/claude-code` after subscribing to a Claude plan
- **A code editor** — VS Code is the standard

### Time Investment

Realistic estimates for someone with intermediate technical skills:

- **Phase 1 (the spine):** 15–25 hours over 2–3 weeks
- **Phase 2 (capture surfaces and email):** 8–12 hours over 1–2 weeks
- **Phase 3 (library and resurfacing):** 6–10 hours over 1–2 weeks
- **Phase 4 (optional modules):** Variable, only if you want them
- **Total to a working daily-use system:** ~40–80 hours

---

## Section 2: Feature Selection Worksheet

Before you start, decide which features you want. The dashboard is modular by design. Not everyone needs all of it.

**Mark each feature with KEEP, SKIP, or DECIDE LATER.**

### Core Features (Recommended for Everyone)

| Feature | Description | Your Choice |
|---|---|---|
| Today screen | Daily overview with calendar, top tasks, observations | KEEP |
| Tasks | Task management with reminders, recurrence, subtasks | KEEP |
| Domains | Top-level life/work areas with slippage detection | KEEP |
| Inbox | Default landing zone for unsorted tasks | KEEP |
| Projects | Finite-outcome work units with milestones | KEEP |
| Voice capture | In-app mic, AI parser, intent routing | KEEP |
| Google Calendar sync | Two-way sync with Google Calendar | KEEP |
| Notifications | In-app feed of system actions | KEEP |

### Library Features

| Feature | Description | Your Choice |
|---|---|---|
| Notes | Free-form thoughts with source types | _____ |
| Quotes | Book and source quotes with author/page | _____ |
| Quote annotations | Add new thoughts to existing quotes over time | _____ |
| Journal | Daily entries with optional photo OCR for handwritten pages | _____ |
| Books | Reading log with cover art and quote count | _____ |
| Inventory | Asset registry for insurance/business equipment | _____ |
| Resurfacing | Daily rotating quote, journal entry, or saved item | _____ |

### Optional Modules

| Module | Description | Your Choice |
|---|---|---|
| Content Pipeline | Track videos/articles from idea → published → derivatives | _____ |
| People CRM | Light contact management with anniversaries and follow-ups | _____ |
| Health | Vitals, labs, workouts, medications. Optionally Garmin/Apple Health import | _____ |
| Routines | Recurring habits separate from tasks, with completion tracking | _____ |
| Email integration | Forward-to-capture, attachment routing to Drive, autonomous actions | _____ |
| Mobile shortcuts | Apple Watch + Android voice capture via OS-level shortcuts | _____ |
| Observations engine | Nightly pattern detection ("project untouched 14 days") | _____ |

### Recommendations by User Type

- **Solo entrepreneur:** All core + Notes + Quotes + Journal + Content Pipeline + People CRM + Mobile shortcuts. Skip Health unless tracking it matters to you.
- **Knowledge worker:** All core + Notes + Quotes + Journal + Mobile shortcuts. Skip Content Pipeline, Inventory, Health.
- **Creative professional:** All core + Notes + Inventory (gear) + Content Pipeline + Mobile shortcuts.
- **Minimalist (start here if unsure):** Core only. Add modules later as you feel the gap.

**Resist the urge to mark everything KEEP.** Each module is real engineering work. You can always add later. You cannot easily remove without rebuilding.

---

## Section 3: Architecture Overview

### Three Layers

1. **Capture layer** — Voice (in-app mic), email forward, mobile shortcuts, webhook ingestion, manual entry
2. **Processing layer** — Anthropic Claude API parses input into structured actions, server executes them
3. **Presentation layer** — Next.js PWA with mobile-first design and bottom tab navigation

### Stack

- **Frontend:** Next.js (App Router) as a Progressive Web App
- **Backend:** Node.js (Fastify or Hono)
- **Database:** PostgreSQL via Supabase
- **Object storage:** Supabase Storage (for photos, receipts, OCR sources)
- **Auth:** Supabase Auth (single user, strong password, optional TOTP)
- **AI:** Anthropic API (Claude Sonnet for parsing, Haiku for cheaper jobs)
- **Hosting:** Your choice (Node.js + Postgres, deployable anywhere)
- **Real-time sync:** Supabase Realtime (optional, for live updates across devices)

### Why This Stack

- **Supabase** gives you managed Postgres + storage + auth in one product. Less infrastructure to manage.
- **Next.js PWA** runs in any browser, installs to phone home screen, no app store needed.
- **Node.js** has the best ecosystem for OAuth integrations (Google Calendar, Gmail).
- **Anthropic API** for parsing because Claude is good at structured output and you're already paying for Claude Code.

### What You Could Substitute

- Postgres without Supabase if you want more control (but you lose storage and auth conveniences)
- Python/Django, Rails, or Go for the backend if you prefer
- React + Vite instead of Next.js if you don't need server rendering
- OpenAI or local LLMs for parsing (Anthropic recommended for quality and consistency)

The reference implementation uses the stack above. Translate as needed for your preferences.

---

## Section 4: Build Phases

Build in phases. Resist the urge to scope everything upfront and build it all. Each phase ships a working tool you can use immediately.

### Phase 1: The Spine (Required, 2–3 weeks)

What you'll have after Phase 1: a working dashboard with tasks, projects, domains, calendar sync, and voice capture. You can stop here and you'll have a useful tool.

**Includes:**
- Auth and account setup
- Today screen with calendar and tasks
- Domains (top-level life/work areas)
- Inbox domain (default for unsorted tasks)
- Projects with target dates and milestones
- Tasks with reminders, due dates, recurrence, subtasks
- Voice capture (in-app mic) with AI parsing
- Google Calendar two-way sync
- Notifications feed
- Manual CRUD for everything

### Phase 2: Capture Surfaces (1–2 weeks)

What you'll have after Phase 2: voice capture from your phone lock screen, Apple Watch, or Android shortcut. Email integration if you want it.

**Includes:**
- Apple Watch / iOS Shortcuts setup
- Android HTTP Shortcuts setup
- Capture token authentication for mobile devices
- Pending capture queue for ambiguous voice input
- (Optional) Email forwarding for capture
- (Optional) Gmail watcher with autonomous attachment routing

### Phase 3: Library and Resurfacing (1–2 weeks)

What you'll have after Phase 3: the system becomes a memory. You can save quotes, journal entries, books read, and have them resurface on your dashboard.

**Includes:**
- Notes (with source_type categorization)
- Quotes with annotations (thoughts you add over time)
- Journal entries (typed and voice)
- Books with cover art via Open Library API
- Resurfacing engine (daily rotating item on Today screen)
- (Optional) Journal photo OCR via Claude Vision

### Phase 4: Optional Modules (Variable)

Pick and choose based on your Feature Selection Worksheet. Each module is independent.

**Available modules:**
- Content Pipeline (for creators)
- People CRM (for relationship management)
- Inventory (for asset tracking)
- Health (for medical/fitness tracking)
- Routines (for habit tracking)
- Observations engine (for slippage detection)

---

## Section 5: The Project Kickoff Prompt for Claude Code

Copy the entire prompt below into Claude Code at the start of your project. This tells Claude Code what to build and how. **You will reference this throughout the build.**

### Setup Steps Before Pasting the Prompt

1. Subscribe to Claude Pro or Max at [claude.ai](https://claude.ai)
2. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
3. Verify Node.js 18+: `node --version`
4. Create a new empty directory for the project: `mkdir personal-ops-dashboard && cd personal-ops-dashboard`
5. Initialize git: `git init`
6. Save this scope document into the directory as `SCOPE.md`
7. Run `claude` to start Claude Code in that directory
8. Paste the kickoff prompt below

### The Kickoff Prompt

```
I am building a personal operations dashboard following the SCOPE.md document
in this directory. Please read SCOPE.md fully before we begin.

This is a multi-phase build. We will work through Phase 1 first and not move 
to Phase 2 until Phase 1 is complete and I have used it for at least 3 days.

Before we write any code, I need you to:

1. Read SCOPE.md completely
2. Ask me which features I want from the Feature Selection Worksheet in 
   Section 2. Walk through each module and confirm KEEP, SKIP, or DECIDE 
   LATER for each one.
3. Confirm the hosting environment I am using (xCloud, Railway, Render, 
   Fly.io, VPS, NAS, etc.)
4. Confirm I have created the required accounts: Supabase, Anthropic API, 
   Google Cloud Console (for Calendar OAuth), GitHub
5. Help me set up the Anthropic API key, Supabase project, and Google OAuth 
   credentials with step-by-step instructions
6. Once accounts are ready, we begin Phase 1 implementation

Rules for our work together:

- Build features in the order specified by SCOPE.md. Do not skip ahead.
- After each significant piece is working, commit to git with a clear message.
- Write code that I can understand and modify. Comment non-obvious decisions.
- Use the data model defined in SCOPE.md. Do not invent new tables without 
  asking me first.
- When something is unclear, ask. Do not guess.
- When something in SCOPE.md does not fit my hosting environment or my 
  feature selections, flag it and propose an adjustment.
- After Phase 1 is complete, pause and let me use it before we move to 
  Phase 2.

I am not an expert developer. Walk me through what you are doing and why. 
When commands need to run in my terminal (not yours), tell me exactly what 
to type and what output to expect.

Start by reading SCOPE.md.
```

### What to Expect After Pasting

Claude Code will:
1. Read the scope document
2. Walk you through feature selection
3. Help you set up Supabase, Anthropic API, and Google OAuth
4. Begin scaffolding the project structure
5. Build Phase 1 piece by piece

You will spend most of your time:
- Answering Claude Code's questions about preferences
- Running commands it tells you to run
- Confirming code looks reasonable before committing
- Testing the working pieces as they ship

---

## Section 6: Data Model Reference

The complete data model. Claude Code will generate the actual migrations from this — you don't need to hand-write SQL.

### Core Tables

```
stewardship_domains       — Top-level life/work areas (Hill Media Group, Personal, etc.)
  id, name, description, failure_patterns (jsonb), 
  expected_cadence, is_system (bool), active

projects                  — Finite-outcome work units
  id, name, description, domain_id, status, 
  kind (project/area — area retired but column retained), 
  type (target_date/retainer), target_date, completed_at

milestones                — Sub-units within a project
  id, project_id, title, status, weight, completed_at

tasks                     — The atomic unit of work
  id, title, notes, status, due_date, due_time, priority,
  domain_id (required), project_id (optional),
  parent_task_id (for subtasks), recurrence_rule (RRULE),
  reminder_offsets (json array of minutes),
  source (manual/voice/email/observation), 
  created_at, completed_at

activity_log              — Project work history
  id, project_id, entry, hours_logged, logged_at, source

calendar_events           — Synced from Google Calendar
  id, google_event_id, title, start, end, location,
  attendees, synced_at, source

notifications             — System action audit feed
  id, type, title, body, source_ref, source_url,
  status (unread/read/dismissed), undo_payload (json), created_at
```

### Library Tables (Phase 3)

```
notes                     — Free-form thoughts
  id, body, 
  source_type (own_thought/reading_response/meeting_note/brainstorm/observation/other),
  source_reference, tags[], 
  related_project_id, related_person_id, related_quote_id,
  created_at, updated_at

books                     — Reading log
  id, title, author, isbn, cover_image_url, 
  status (reading/finished/abandoned/want_to_read),
  format (physical/kindle/audiobook),
  started_at, finished_at, rating, my_summary

quotes                    — Saved quotes
  id, book_id (nullable), text, page_number, chapter,
  source_type (book/article/podcast/conversation/sermon/other),
  source_reference, source_author, tags[],
  added_via (voice/manual/import), 
  resurface_weight (numeric), created_at, last_surfaced_at

quote_annotations         — Thoughts added to quotes over time
  id, quote_id, body, annotated_at,
  context (on_capture/on_revisit/on_surface), tags[]

journal_entries           — Daily journal
  id, entry_date, image_path (for handwritten OCR source),
  transcription_text, source (handwritten_photo/voice/typed),
  tags[], extracted_facts (json),
  resurface_weight (numeric), created_at

journal_books             — Physical journal tracking
  id, book_number, start_date, end_date, notes
```

### Optional Module Tables

```
content_items             — Phase 4 if Content Pipeline selected
  id, title, channel, type (video/article/short_clip/podcast),
  status (idea/outline/filming/editing/published/derivatives_pending/done),
  outline_md, video_url, published_at,
  parent_id (for derivatives), derivative_type

content_templates         — Auto-spawn derivative tasks
  id, channel, trigger_status, derivative_type,
  title_template, default_due_offset_days, active

people                    — Phase 4 if People CRM selected
  id, name, relationship_type, email, phone, company,
  notes, created_at

person_facts              — Anniversaries, kid names, follow-ups
  id, person_id, fact_type, fact_value, source_ref,
  date_relevant, recurring (bool)

person_interactions
  id, person_id, interaction_type, notes, occurred_at

inventory_items           — Phase 4 if Inventory selected
  id, category, brand, model, serial_number,
  purchase_date, purchase_price, purchase_source,
  current_value_estimate, status (owned/sold/lost/damaged),
  sold_date, sold_price, photos (json), receipts (json),
  location, notes

health_visits, health_metrics, lab_panels, lab_results,
wellbeing_check_ins, medications, health_documents,
workouts, health_history  — Phase 4 if Health selected
  (See Phase 4 Health module section for details)

routines                  — Phase 4 if Routines selected
  id, name, description, frequency (daily/weekly/etc),
  schedule (json), goal_value, active

routine_completions
  id, routine_id, completed_at, value
```

### System Tables

```
observations              — Pattern detection results
  id, type, severity, title, body, supporting_data (json),
  domain_id, project_id, surfaced_at, dismissed_at, acted_on

action_log                — Autonomous action audit
  id, action_type, target_system, description,
  payload (json), status, triggered_by, executed_at

pending_captures          — Ambiguous voice captures awaiting triage
  id, raw_transcript, source, captured_at,
  parsed_intent (json), candidates (json),
  status (pending/resolved/expired), resolved_at

capture_tokens            — Bearer tokens for mobile shortcuts
  id, token_hash, label, device_name, scopes (json),
  rate_limit_per_hour, last_used_at, revoked_at

email_rules               — Phase 2 if email integration selected
  id, name, match_criteria (json), action_type,
  action_params (json), confidence_state, confirmation_count

captured_data             — Generic webhook ingestion
  id, source, type, payload (jsonb), tags[],
  display_hint, processed_status, created_at, source_ref

resurfacing_seen          — Track surfaced items to prevent repeats
  id, item_type, item_id, surfaced_on, user_response

app_settings              — Configurable app settings
  id, key, value (jsonb), updated_at
```

---

## Section 7: Voice Capture System

The voice capture system is the defining feature. Here's how it works.

### Flow

1. User taps the in-app mic button (or uses a mobile shortcut)
2. Browser captures audio and transcribes it via Web Speech API (or, for mobile shortcuts, the OS handles transcription)
3. Transcript is sent to your backend at `/api/capture` with a source identifier
4. Backend calls Anthropic Claude API with a parser system prompt and the transcript
5. Claude returns structured JSON with one or more "actions" to execute
6. Backend executes the actions against your database
7. UI shows confirmation toast; mobile shortcuts get a spoken confirmation

### The Voice Parser System Prompt

Claude Code will generate this from the data model and feature selection. The core structure:

```
You are a parser for [User]'s personal operations dashboard. You receive a 
voice transcript and return a JSON array of structured actions.

Context provided with each request:
- Current date and time in user's timezone
- List of active domains (with IDs and names)
- List of active projects (with IDs, names, and parent domain_id)
- List of recent people referenced (last 30 days)
- List of active content items
- The capture source (in-app, watch, ingest, etc.)

Available action types:
- create_task: { domain_match?, project_match?, title, due_date?, due_time?, 
  priority?, parent_task_match?, reminder_offsets? }
- complete_task: { task_match }
- create_project: { name, domain_match, target_date }
- update_project_status: { project_match, status }
- log_activity: { project_match, entry, hours_logged? }
- update_milestone: { project_match, milestone_match, progress_pct, status }
- create_calendar_event: { title, start, end, location?, attendees? }
- create_note: { body, source_type, source_reference?, tags?, 
  related_project_match?, related_person_match?, related_quote_match? }
- create_quote: { text, book_match?, source_reference?, source_author?, 
  page_number?, tags? }
- create_quote_annotation: { quote_match, body, context? }
- create_journal_entry: { text, date? }
- create_person_fact: { person_match, fact_type, fact_value, 
  date_relevant?, recurring? }
- update_content_item: { item_match, status, video_url?, outline_md? }
- add_inventory_item: { category, brand, model, serial_number?, 
  purchase_date?, purchase_price? }
- set_resurface_weight: { item_type, item_match, weight }

Rules:
1. Return only valid JSON. No prose, no preamble.
2. Multiple actions per utterance are common — return an array.
3. Match references fuzzy ("Reviews plugin" matches "Site Nitro Reviews Plugin v2").
4. If ambiguous (could match two projects), return 
   { needs_disambiguation: true, candidates: [...] }
5. Date phrases ("tomorrow", "Friday", "next week") resolve to ISO dates 
   in the user's timezone.
6. For create_task: if no domain or project is named, leave both blank. 
   Server defaults to Inbox.
7. If you cannot parse the input confidently, return 
   { "error": "...", "transcript": "..." }
```

### Routing Rules for Common Utterances

| Utterance | Result |
|---|---|
| "Add a task to write the Q2 report" | Task in Inbox (no domain specified) |
| "Schedule a call with Sam Thursday at 2pm" | Calendar event created |
| "Log 30 minutes on the website redesign project" | Activity logged + hours added |
| "Save a quote from Deep Work page 47: [text]" | Quote created, linked to book |
| "Add a thought to the Cal Newport quote about focus" | Annotation added to existing quote |
| "Mark the Acme project deliverable complete" | Task completed |
| "Boost the journal entry from yesterday" | Resurface weight increased |

### Cost Estimate for Voice Parsing

At moderate use (15–20 captures per day):
- ~$8–12/month using Sonnet for primary parsing
- ~$2–3/month using Haiku for simpler routes
- Total: ~$10–15/month in API costs

Prompt caching cuts the system prompt cost by 90% on repeated calls. Use it.

---

## Section 8: Mobile Shortcuts Setup

After Phase 2 ships, you'll set up voice capture on your phone.

### iOS / Apple Watch

Built in the iOS Shortcuts app. Available on iPhone, Apple Watch, and Mac.

**Shortcut: "Capture to Dashboard"**

Actions:
1. **Dictate Text** (set to "Stop on Pause")
2. **Get Contents of URL**
   - URL: `https://your-dashboard-domain.com/api/capture`
   - Method: POST
   - Headers:
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer YOUR_CAPTURE_TOKEN`
   - Request Body (JSON):
     ```
     {
       "transcript": [Dictated Text],
       "source": "ios_shortcut",
       "device_context": { "device_name": "[Device Name]" }
     }
     ```
3. **Get Dictionary Value** — pull `spoken_confirmation` from response
4. **Speak Text** — speaks the confirmation back

Activation: "Hey Siri, capture to dashboard" works on phone, watch, AirPods, HomePod.

### Android

Recommended: **HTTP Shortcuts** app (free, open source, on F-Droid and Play Store).

Setup:
1. Install HTTP Shortcuts
2. Create new shortcut: "Capture to Dashboard"
3. Configure:
   - Method: POST
   - URL: `https://your-dashboard-domain.com/api/capture`
   - Headers: `Authorization: Bearer YOUR_TOKEN`, `Content-Type: application/json`
   - Body (JSON): `{ "transcript": "{voice}", "source": "android_shortcut" }`
   - Voice input variable: prompt for speech on execution
4. Place shortcut on home screen as a widget

### Capture Token

Generate in Dashboard Settings → Integrations → Mobile Capture. Token is a 64+ character random string scoped to POST `/api/capture` only. Cannot read or modify other data. Revocable.

---

## Section 9: Cost Breakdown

Realistic monthly operating costs for a moderate-use deployment:

| Item | Cost |
|---|---|
| Claude Pro (for Claude Code) | $20/month (or $17/month if annual) |
| Anthropic API (voice parsing, observations) | $10–15/month |
| Supabase Pro | $25/month |
| Hosting (xCloud, Railway, Render, Fly.io) | $5–25/month |
| Domain name | ~$1/month amortized |
| Pushover (optional) | $5 one-time |
| Total monthly | **$60–85/month** |

### What This Replaces

If you're consolidating tools, monthly savings might include:
- Todoist Premium ($5)
- Readwise ($10 — sunset after import)
- Notion paid plan ($8–10)
- Personal finance tool ($8–10)
- Any all-in-one tool like Saner.AI or Reflect ($10–15)

Net incremental cost after consolidation: often **$25–45/month true new spend**.

### When the Math Doesn't Work

This is not a frugal tool. If $60–85/month is hard, the simpler answer is to use a free tier of Notion or stay with Todoist. The value here comes from owning your data, custom workflows, and the focus dividend. If those don't justify the cost for you, that's a legitimate answer.

---

## Section 10: What I Would Do Differently

Honest notes from the actual build.

### Things I Over-Built

- **Health tracking.** Added 9 tables and two planned future sessions. I'm not sure I'll use it. Skip unless you're actively tracking medical conditions or training data.
- **Generic webhook ingestion (`captured_data` table).** Built it for future-proofing, never wrote a consumer of it. Skip until you have a concrete use case.
- **Multiple YouTube channel domains.** I have separate domains for each channel. Consider whether one "Content" domain with channel tags would work better.

### Things I Under-Built

- **The Inbox concept.** I originally tried to assign all tasks to specific domains or projects. This forced one-off "projects" for things that weren't projects. Adding a true Inbox catch-all domain was the missing piece. **Build Inbox from the start.**
- **Slippage criteria.** I built the engine but didn't tune the criteria. As a result, "stalled" indicators stayed empty even when work was actually slipping. **Set initial criteria during Phase 1, not later.**
- **Domain status visibility.** The system can detect slipping domains but I didn't surface this prominently on Today. Add the domain-status card to Today screen from day one.

### Things I Got Right

- **Capture liberal, display conservative.** Strict ceiling on Today screen items kept it useful instead of overwhelming.
- **Voice-first.** I use voice capture more than typed entry on mobile.
- **Self-hosted with Supabase.** The data ownership and cost stability are worth the operational cost.
- **Phase-based building.** Resisting the urge to scope everything upfront and ship in stages was the right call.

### The Hardest Architectural Decision

The Domain/Area/Project hierarchy went through three iterations:

1. Initially: only Projects existed, tasks attached to projects only. Problem: ongoing-responsibility work had no home.
2. Added "Areas" as a separate concept (PARA model). Problem: confusing overlap with Domains, and the implementation actually used `kind='area'` on the projects table.
3. Final: Domains are the top-level container, Projects are finite-outcome work units under Domains, Inbox is the catch-all default domain, Areas are retired entirely.

**Build the final model from the start.** Don't repeat my journey.

---

## Section 11: Common Pitfalls and Troubleshooting

### Voice Parser Returns Bad Output

Most common cause: insufficient context in the system prompt. The parser needs to see your current domains, projects, and recent people. If you've changed names, the parser may still reference the old ones in cached context.

**Fix:** Rebuild the parser context per request. Don't cache context that changes.

### Calendar Sync Drifts

Google Calendar API rate limits are real. If you sync too often, you get throttled.

**Fix:** Sync every 15 minutes on a cron, not on every page load.

### Tasks Have NULL Domains After Migration

If you add domain_id without a default, existing tasks break.

**Fix:** Create the Inbox domain first, then run UPDATE statements to route all NULL-domain tasks to Inbox, then add the NOT NULL constraint.

### Mobile Shortcuts Stop Working After Hosting Changes

If you move hosts and your URL changes, every mobile shortcut breaks silently.

**Fix:** Use a stable domain name. Update shortcuts in one place when you migrate.

### Supabase Free Tier Pauses Your Project

After a week of no activity, the free tier pauses. Your dashboard goes offline.

**Fix:** Use the Pro tier ($25/month). Don't try to skip this.

### Anthropic API Bills Surprise You

If your voice parser calls Claude on every keystroke or every page load, costs balloon.

**Fix:** Only call the API on user-initiated capture events. Cache the system prompt via prompt caching. Use Haiku for cheap routes.

### PWA Doesn't Install on iOS

iOS Safari is finicky about PWA installation. Some features (push notifications, certain APIs) require specific setup.

**Fix:** Test installation early. Check Apple's PWA support documentation. Consider a Capacitor wrapper if PWA limits become painful.

---

## Section 12: Optional Module Details

If you marked any of these KEEP in Section 2, here's what they entail.

### Content Pipeline

For creators tracking videos, articles, podcasts from idea to publication.

**Pipeline statuses:** Idea → Outline → Filming → Editing → Published → Derivatives Pending → Done

**Key feature:** When a video flips to Published with a URL, the system auto-spawns derivative tasks based on a template per channel. Example: a published YouTube video might spawn "Write blog post version," "Cut three short clips," "Mention in next newsletter."

**Build cost:** ~6–8 hours in Phase 4.

### People CRM

Light contact management focused on remembering important things people share.

**Key feature:** When you mention something in a journal entry like "Sarah mentioned her anniversary is in August," the parser can extract that to a person_fact with `date_relevant` set. Two weeks before, the system surfaces "Sarah's anniversary in 2 weeks (mentioned in journal entry March 12)."

**Build cost:** ~4–6 hours in Phase 4.

### Inventory

Asset registry for insurance and business equipment tracking.

**Key feature:** Voice-driven entry, photo attachment, receipt attachment, and exportable inventory PDF for insurance purposes. Mark items as sold/lost/damaged to maintain history.

**Build cost:** ~4–6 hours in Phase 4.

### Health

Medical history, vitals, labs, workouts, medications.

**Key feature:** Optional Garmin/Apple Health import. Lab PDFs OCR'd via Claude Vision. Visit-linked lab results.

**Build cost:** ~12–20 hours in Phase 4. The most complex optional module.

**Consider skipping unless:** You're actively managing a medical condition, training seriously, or have a doctor who wants tracked data.

### Routines

Recurring habits separate from tasks.

**Key feature:** Habit tracking with completion history, goal-progress visualization, and a heatmap view.

**Build cost:** ~4–6 hours in Phase 4.

### Email Integration

Forward-to-capture and Gmail watcher for autonomous actions.

**Key feature:** System can move email attachments to client Drive folders, create task drafts from emails containing action language, surface forwarded items as captures.

**Build cost:** ~8–12 hours in Phase 2. **Significant security and trust implications** — the system acts on your behalf in Gmail and Drive. Approval-first trust model recommended.

### Observations Engine

Nightly pattern detection.

**Key feature:** Surfaces things like "Project X untouched 14 days," "Domain Y: no completed tasks in 10 days," "Tomorrow has 4 meetings, only 2 hours of focus time."

**Build cost:** ~4–6 hours in Phase 4. **Critical:** observations are factual, not advisory. "Project untouched 14 days" is fine. "You should work on this" crosses a line.

---

## Section 13: After You Ship

Things to do once Phase 1 is working and you've used it for a week.

### Validation Questions

Answer these honestly:

1. Am I using the tool daily?
2. Am I capturing via voice more than typing?
3. Have any deadlines been caught because the system surfaced them?
4. Has anything stalled that the system flagged before I noticed?
5. Am I dumping things in the Inbox without triaging?

If yes to 1–2 and at least one of 3–4, the tool is working. If no to most, something is off — either the tool isn't fitting your workflow or you're not actually committed to using it.

### Common Adjustments After Week 1

- Slippage criteria are too strict (too many false alarms) or too loose (nothing fires)
- Today screen has the wrong things on it
- Voice parser misroutes common phrases — refine the system prompt with examples
- Inbox fills up and you don't triage — surface it more prominently, or accept that it's a permanent backlog

### When to Add a Module

Add an optional module when you've felt the gap for at least two weeks. Don't add modules speculatively. If you find yourself thinking "I really need a place to track X," that's the signal.

### Maintenance

This is a personal tool. You will maintain it forever. Plan for:
- Supabase + hosting bills, monthly
- Occasional bug fixes when something breaks
- Periodic dependency updates
- Schema changes as your needs evolve

If maintenance fatigue sets in, that's a real risk. The system has to keep being worth more than it costs in attention.

---

## Section 14: Closing Thoughts

This is not a tool for everyone. It's a tool for people who:

- Have enough cognitive load that fragmented tools aren't working
- Care about owning their data
- Are willing to build the tool to get exactly what they need
- Will actually use a dashboard daily

If that's you, build it.

If it isn't, save yourself the time and use Todoist + Apple Notes + Google Calendar. You'll be fine.

The point is not the dashboard. The point is having an external memory that helps you steward what's already in front of you. The tool is a means. The end is being someone who doesn't drop the things that matter.

---

## Appendix A: Subscription Quick Reference

| Service | URL | What You're Buying |
|---|---|---|
| Claude Pro | claude.ai/upgrade | Access to Claude Code |
| Anthropic API | console.anthropic.com | Pay-per-token API usage for the parser |
| Supabase | supabase.com | Postgres + storage + auth |
| xCloud | xcloud.host | Node.js hosting (or pick your alternative) |
| Pushover | pushover.net | Push notifications (optional) |
| Google Cloud Console | console.cloud.google.com | OAuth credentials for Calendar/Gmail (free) |

## Appendix B: Initial Domains Worksheet

Before starting Phase 1, list the domains you want to start with. Aim for 5–9. Examples:

- Work (or your business name)
- Side project (if applicable)
- Personal / Life
- Specific creative outlet (if active)
- Family / Relationships
- Health (only if you'll use it)
- Inbox (system creates this automatically)

Avoid more than 9 — the picker gets cluttered. Avoid fewer than 3 — the categorization stops being useful.

## Appendix C: Documents You'll Want Later

After Phase 1 ships, you'll want to create:

- A `README.md` for the project with setup notes for your future self
- A `CHANGELOG.md` to track what you've changed
- A backup script that pulls Supabase to local file storage weekly
- A list of test prompts for the voice parser to regression-test changes

Claude Code can generate all of these. Ask for them when you're ready.

---

*This document is provided as-is for personal use. If you build something using this guide and want to share what you learned, I'd love to hear about it. Find me at jeradhill.com or on Field Notes.*

*End of Build Guide v1.0*
