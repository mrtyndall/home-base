# Home Base Architecture

Home Base is a single-user personal operations system for tasks, calendar, areas, projects, ideas, captures, and search. The product requirement is trust: raw captures are preserved before parsing, active views must not show stale completed items, and completed, killed, someday, or parked records remain searchable.

## Stack

- Next.js 16 App Router PWA
- React 19 and Tailwind CSS 4
- PostgreSQL on Railway as the canonical data store
- Prisma 7 with `@prisma/adapter-pg`
- Anthropic API for capture parsing
- Pushover for reminder delivery
- Google Calendar OAuth, encrypted refresh-token storage, 15-minute scheduled sync, and local calendar event storage
- REST API plus streamable HTTP MCP server for agent access
- Railway for the hosted app and canonical Postgres
- Local LaunchAgents for a Railway-database-backed app server and reminder scheduler, with Tailscale Serve for remote access

## Shape

This is a single Next.js app, not a split frontend/backend service. Server components load database-backed views. Route handlers under `src/app/api` handle capture, integrations, and mobile shortcuts. Shared server code lives under `src/lib`.

## Local Runtime

Railway Postgres is canonical. The local runtime is a second application origin over the same real database:

- Database: Railway Postgres, resolved by the LaunchAgent at runtime without storing its credential in the repository
- Local env: `.env.local` for non-database development settings
- App server: LaunchAgent `com.mrtyndall.home-base`, using the production standalone server against Railway Postgres
- Reminder scheduler: LaunchAgent `com.mrtyndall.home-base-reminders`
- Calendar sync scheduler: LaunchAgent `com.mrtyndall.home-base-calendar-sync`
- App port: `127.0.0.1:3002`
- MCP port: `127.0.0.1:8081`
- Tailnet URL: `https://mac-studio.tail3baa7a.ts.net/`
- Tailnet MCP URL: `https://mac-studio.tail3baa7a.ts.net:8443/api/mcp`
- Railway URL: `https://home-base-production-e3b7.up.railway.app/`

Useful commands:

```bash
npm run db:deploy
npm run db:seed
npm run calendar:sync
launchctl kickstart -k gui/501/com.mrtyndall.home-base
tailscale serve status
```

## Deploy Pipeline

Two origins serve this app and both must be updated on release:

1. **Railway** (`https://home-base-production-e3b7.up.railway.app`, canonical Railway Postgres): deploy with `railway up --detach` from a clean `git worktree` at the release commit (the working tree may hold another agent's edits; `railway up` uploads the directory and records no git metadata). The container CMD uses the lockfile-pinned Prisma CLI to run `prisma migrate deploy` before the server starts, then inserts only missing bootstrap defaults. It never reseeds Areas or overwrites settings. Check deploy logs for the applied migration list and verify by content fingerprint against the production URL, never by deployment status alone.
2. **Local runtime** (`127.0.0.1:3002` behind `https://mac-studio.tail3baa7a.ts.net`, same canonical Railway Postgres): the LaunchAgent serves the standalone build its process loaded at start and resolves the Railway connection at runtime. After a release: `npm run build`, then `launchctl kickstart -k gui/501/com.mrtyndall.home-base` and `launchctl kickstart -k gui/501/com.mrtyndall.home-base-mcp`. Do not run local migration commands against the canonical database as part of this restart; Railway deploy owns migration application. A long-lived process here is the usual cause of "production looks stale" reports, since phone shortcuts may point at the tailnet URL.

For an Area-first release, first create a fresh backup and run the old-schema-safe preflight: `npm run verify:area-release -- --preflight`. It rejects the migration's true legacy blocker (a Project attached to `area_inbox`) and prints the current Book/Movie baseline flags. After the migration reaches `SUCCESS`, run the strict read-only gate with those recorded values: `npm run verify:area-release -- --expected-books=<recorded-count> --expected-movies=<recorded-count>`. The post-release gate fails if Inbox compatibility references remain, Project/Area integrity is broken, or either retained media count changes.

For the nested-Area/optional-Project-Area release, run `npm run verify:hierarchy-release -- --preflight` before migration and retain its Book, Movie, Area, Project, and Reference flags. After migration, run the same command with all five `--expected-*` values. Both phases execute in an explicitly read-only transaction and reject orphan Project Area references or Task/Idea/Reference Area mirrors that differ from their Project. The legacy preflight detects the absence of `parent_area_id` and records zero for cycle/orphan-parent checks that cannot yet exist; strict postflight requires that column, rejects Area cycles and orphan parents, and rejects baseline drift. Verification requires a successful rollback, reports problems, and never repairs data. Production preflight still requires a fresh backup, and migration application remains the deploy pipeline's responsibility.

The direct Railway URL is intentionally open during the Area-first rollout. Cloudflare Zero Trust Access is the planned access boundary; its rollout is incomplete until the direct Railway origin is disabled or otherwise blocked from bypassing Cloudflare.

## Integrity Rules

- `captures` is the sacred append-only ledger. Every capture request writes raw text first.
- Parser failures update the capture status but do not remove or overwrite raw input.
- No app data uses hard deletes. Completed, killed, and parked are statuses.
- AI-created rows link back to `capture_id`.
- Areas form an acyclic tree through optional `parent_area_id`; missing parents and cycles are release-blocking integrity failures.
- Projects may belong to one Area or remain unfiled. Tasks, Ideas, and References attached to a Project mirror that Project's optional Area; Project filing updates all three child types atomically, while the task database trigger protects task/project alignment on direct task writes.
- Eligible content may remain unfiled in the global Inbox.
- Agent writes use `source = api:<key label>` where the table has a source field, and every API write creates a notification feed entry.
- Search must include raw captures and inactive records.
- Local database backups are part of the foundation, not a later operational cleanup.
- TODO tripwire: enable off-machine database backups as soon as Home Base becomes a daily-reliance system.

## Reminder Delivery

Reminder offsets are delivered by `scripts/send-reminders.ts`, intended to run once per minute. The job finds open tasks whose reminder time is due and writes append-only `reminder_deliveries` records after delivery. If the app was down during the reminder window, the recovery send uses overdue reminder framing instead of silently skipping.

Tasks with a due date and no due time use the `default_due_date_reminder_time` app setting, defaulting to `08:00` America/New_York. Every push delivery also creates a notification feed entry.

## Agent Access

The REST API lives under `/api/v1` and uses bearer API keys stored as hashes in `api_keys`. Minimum scopes are `read`, `write`, and `capture`; write rate limits are conservative by default. API routes intentionally expose no delete method. The hierarchy boundary is `GET/POST /areas`, `GET/PATCH /areas/:id`, `GET/POST /projects`, and `GET/PATCH /projects/:id`: Area reads include full paths, Area writes accept `parentAreaId`, and Project writes accept an optional or null `areaId`.

The MCP server lives in `mcp/http-server.ts` and wraps the REST API over streamable HTTP at `/api/mcp`. Its current hierarchy tools are `list_areas`, `read_area`, `create_area`, `reparent_area`, `update_area_state`, `create_project`, `update_project_state`, and `file_project`; the remaining tools cover all-clear/search, task actions, project park/unpark, ideas, shared markdown notes/docs, milestones, calendar, check-ins, journal/resurfacing/reviews, routines, and people. The in-app data chat is a separate read-only agent surface and exposes path-labelled `list_areas` alongside search, summaries, tasks, people, journals, and Project reads.

## Calendar Sync

`calendar_sync_states` stores sync freshness and powers the Today screen stale-warning line. Sync is intentionally never triggered on page load. The local scheduler runs `scripts/sync-google-calendar.ts` every 15 minutes.

Matt chose the hosted Railway/domain OAuth path on 2026-07-03. The Google Cloud Console authorized redirect URI must be:

```text
https://home-base-production-e3b7.up.railway.app/api/google/oauth/callback
```

OAuth routes:

- `/api/google/oauth/start`: starts Google authorization with offline access.
- `/api/google/oauth/callback`: exchanges the code, encrypts the refresh token, stores it in `calendar_oauth_tokens`, and runs an initial full sync.

The refresh token is encrypted with `GOOGLE_TOKEN_ENCRYPTION_KEY`; that key must come from 1Password/Railway environment variables. The database never stores the plaintext refresh token.

The sync worker pushes unsynced Home Base calendar events to Google, then pulls Google changes using Calendar API sync tokens. Google remains the source of truth on conflicts. If Google invalidates the sync token, the worker marks existing Google-origin events cancelled and performs a full resync without hard deletes.

The Railway app service is deployed with Google OAuth completed (2026-07-03, "Production Hub Auth" client, redirect URI registered in Google Cloud Console). Scheduled sync on Railway runs through a `calendar-sync-cron` service (`cron/Dockerfile`, cron `*/15 * * * *`) that curls `POST /api/cron/calendar-sync` with `CRON_SECRET`, because the standalone runner image has no tsx/scripts. `GOOGLE_TOKEN_ENCRYPTION_KEY` lives only in Railway variables (the 1Password service account is read-only, so no vault copy exists).

## Hierarchy And Containers

Areas are ongoing responsibilities and information canvases with `active`, `parked`, and `retired` statuses. They nest through an optional parent Area and are the default holder for durable context: notes, references, docs, check-ins, standing tasks, and child projects. Projects are finishable or time-gated containers with `someday`, `active`, `parked`, `completed`, and `killed` statuses; their Area is optional so they can remain unfiled until their destination is clear. A project requires a clear end state, deliverable, deadline, time gate, milestone path, or temporary focused effort. Someday and parked projects stay browsable, carry current state and next step, and are excluded from slipping logic. Areas never participate in slipping logic. Eligible Tasks, Notes, Documents, Ideas, and References may remain unfiled in the global Inbox; Books and Movies remain global, and People remain global with an optional Area link.

Areas and projects share container tables for markdown notes (`entity_notes`), markdown docs (`entity_docs`), and file attachment metadata (`documents`). `entity_notes.starred_at` supports manually starred important notes; nothing auto-stars notes. Check-ins render at the top of both area and project pages as the living timeline, while the generated activity log remains a quieter audit trail. Project-only depth lives in `milestones`. Text-bearing state and docs are plain markdown for portability, full-text search, agent access, and future Obsidian export. Area/project state fields are optional and are shown only when the system already has real data; list cards favor derived task, activity, and note signals.

Future idea bucket: the system may later suggest notes that could be starred based on repeated references, links to active tasks/projects, or resurfacing frequency. Suggestions must never auto-star notes and must never appear as nags or urgency.

## Current Components

- `src/app/page.tsx`: Home landing page with derived entry cards for Today, Tasks, Projects, Ideas, and Inbox.
- `src/app/today/page.tsx`: Today screen with the all-clear state, calendar freshness, due-today/tomorrow horizon, and recently captured strip.
- `prisma/schema.prisma`: core Section 12 data model.
- `prisma/seed.ts`: insert-only development bootstrap for canonical starter Areas and missing app-setting defaults.
- `scripts/backup-database.ts`: `pg_dump` backup with optional S3-compatible upload.
- `scripts/import-apple-reminders.ts`: one-time CSV importer that writes captures then tasks.
- `scripts/register-api-key.ts`: hashes an externally supplied API token into `api_keys`.
- `scripts/send-reminders.ts`: minute scheduler target for Pushover reminder delivery.
- `scripts/sync-google-calendar.ts`: 15-minute scheduler target for Google Calendar two-way sync.
- `src/app/api/v1/[...path]/route.ts`: REST API for agent access.
- `src/app/api/google/oauth/start/route.ts`: Google OAuth authorization start.
- `src/app/api/google/oauth/callback/route.ts`: Google OAuth callback and initial sync.
- `src/app/api/tasks/[taskId]/schedule/route.ts`: narrow manual task rescheduling endpoint used by row menus and drag/drop.
- `src/app/projects/[projectId]/page.tsx`: project re-entry/detail view with editable current state, next step, activity, open tasks, and status actions.
- `mcp/http-server.ts`: streamable HTTP MCP wrapper around the REST API.
- `src/lib/calendar/google.ts`: Google OAuth, encrypted token storage, push/pull sync, and conflict handling.
- `src/lib/db.ts`: Prisma client configured for PostgreSQL.
- `src/lib/reminders.ts`: due reminder selection, Pushover delivery, and audit writes.
- `src/lib/tasks.ts`: shared task creation/completion and recurrence behavior.
- `src/app/settings/page.tsx`: integration control surface with per-variable configuration status (names only, never values), Google Calendar connect flow, Pushover test delivery, Library reference lookup provider status, API key list with revoke, and MCP posture/health.
- `src/app/settings/actions.ts`: server actions for the Pushover test notification and API key revocation, both audited through the notifications feed.
- `src/app/api/settings/mcp-health/route.ts`: read-only probe of the MCP server `/health` endpoint (`MCP_HEALTH_URL` override, defaults to the local port).

## Changelog

### 2026-07-14

- Added nested Areas through optional parent Areas and allowed Projects to remain unfiled. Shared hierarchy validation now protects UI, REST, MCP, and in-app chat paths; Project filing keeps Task, Idea, and Reference Area mirrors consistent.
- Added the read-only hierarchy release gate with cycle/orphan/mirror checks and Book, Movie, Area, Project, and Reference preservation baselines.

### 2026-07-04

- Reweighted Areas as the primary information canvas. The Projects route now surfaces domain-grouped area cards before project shelves; Area pages lead with check-ins, then important notes/knowledge containers, then standing tasks and child projects. Project pages keep check-ins as the heartbeat, with milestones and important notes before task execution. Added manual starred shared notes through `entity_notes.starred_at`; system-suggested important notes are documented as a future idea only.
- Added Library reference lookup status to Settings. Open Library renders as available without credentials for book search, while TMDB shows configured or missing based on `TMDB_ACCESS_TOKEN` / `TMDB_API_KEY` without exposing values.
- Removed recent capture receipts from Home. Capture receipts remain available as audit trail deeper in Inbox/Today, while Home stays focused on clearance, commitments, attention, and resurfaced memory.

### 2026-07-03

- Turned `/settings` into an integration control surface. Google Calendar shows connect/missing-variable/sync-freshness states plus the required OAuth redirect URI; Pushover shows per-variable presence and a test notification button with audit entries; API access lists key labels, scopes, last-used, and revoked state with two-step revoke (revoke only, creation stays on the command line so tokens never pass through the page); MCP shows local/Tailscale routes and an on-demand health check. Fixed the settings env check to use `GOOGLE_TOKEN_ENCRYPTION_KEY` instead of the nonexistent `ENCRYPTION_KEY`. Nothing syncs on page load.
- Migrated the data model to Domains -> Areas -> Projects -> Tasks. Added `areas`, shared markdown container tables, file attachment metadata, project milestones, someday project status, and someday tasks. Existing 3 projects and 12 tasks were mapped to areas with zero missing area assignments and zero row loss in the local alpha database.
- Updated the REST API and MCP layer for the area hierarchy, someday projects/tasks, shared markdown notes/docs, milestones, area reads/state updates, and search across first-class containers. API proof covered bearer-auth area creation/update, someday project creation, project activation, entity notes/docs, milestone completion, search readback, and audited notifications.
- Remediated project/area surfaces to derive card content from tasks, notes, and activity instead of asking for state. Project state fields became nullable, creation paths stopped generating placeholder state, and park/status actions moved into overflow controls.
- Remediated capture classification so ambiguous/unclassifiable captures no longer create fallback tasks. Pending captures stay as raw ledger rows in the Inbox area and can be converted to task, idea, note, or reference while preserving capture lineage.
- Remediated the persistent capture bar so text and voice are peer inputs. Web Speech API interim transcripts are written into the text field, submitted through the same `/api/capture` route, and preserved on unsupported/error paths.
- Surfaced domains as a real organizing layer on project and task surfaces: Projects groups cards under collapsible domain headers and Tasks can filter every section by domain. Today remains domain-agnostic.
- Remediated the Tasks tab with section jump links, plain-text counts, an Unscheduled section, and inline task assignment through the row action menu. Assignment uses a narrow route handler and preserves project-implies-area integrity.
- Added progressive task depth: a fast Inbox-default quick task row, task detail pages for all extended task fields, linked task rows from Today/Tasks, and notification-audited manual detail updates.
- Added one-gesture task rescheduling from Today and Tasks rows, backed by an audited date-only schedule endpoint and Today drop zones.
- Reworked the Tasks tab into Today, Tomorrow, Upcoming grouped by date, and No date sections using the same row-level rescheduling and drop-zone primitives.
- Added project creation from the Projects tab, project detail editing for current state/next step, explicit completed/killed status actions, and project keyword search coverage.
- Added task-to-project assignment paths: domain-filtered task detail picker, optional project selector on quick-add, project-page task creation, and capture parser project-match domain alignment.
- Implemented the hosted Google OAuth path chosen by Matt: OAuth start/callback routes, encrypted refresh-token storage, sync-token based pull, local-event push to Google, and a 15-minute scheduler command.
- Created the Railway `home-base` project with Postgres and deployed the app at `https://home-base-production-e3b7.up.railway.app/`.
- Added Milestone 2 foundations: reminder deliveries, API keys, calendar sync state, REST API, MCP server, parked project UI, subtask UI, recurrence-on-completion behavior, and Apple Reminders CSV import.
- Added Pushover reminder scheduler logic with append-only delivery audit rows and in-app notification mirroring.
- Added Today calendar sync freshness display and recently captured outcome labels.
- Split Home and Today into separate routes: `/` is the launch surface and `/today` keeps the focused today-plus-tomorrow workflow. Search remains a top utility instead of a bottom tab.
- Improved Inbox pending captures so each raw capture renders as a distinct card with its own destination picker and conversion actions.
- Updated the Today recently captured strip to prefer filed capture outcomes and links after pending captures are converted.
- Made the Home recent capture surface actionable: pending captures route to Inbox sorting, filed captures route to the created item or Search.
- Added a project timeframe control that makes target date/open-ended status more prominent than manual state.
- Expanded docs creation into an in-page markdown editor/import surface with `.md` upload support.
- Added task drag hover previews so destination sections show the moving task card before drop.
- Tamed the Tasks project filter into one grouped selector so the filter surface stays readable as the project list grows.
- Reworked the Tasks section jump row into a stronger navigation rail with plain-count emphasis for populated sections.
- Changed Tasks filters to support multi-select domain/project chips and made section tiles filter the visible list instead of anchor-jumping.
- Added an actual floating task drag preview so dragged cards visibly travel through Today and Tasks while drop targets remain highlighted.
- Reworked Home from a passive status dashboard into action cards for Today, Inbox, Tasks, Projects, Ideas, and Settings, and removed the duplicate recent-capture billboard.
- Improved task quick-add with a visible title label/placeholder and project chips instead of a project dropdown, while preserving instant title-first add.
- Added a bounded Today task inbox for open unscheduled tasks, ordered by recent update so clearing a date keeps the task visible and easy to move back into Today/Tomorrow.
- Moved Google Calendar sync freshness from a top-level Today alert into quiet metadata under Today's Calendar, escalating only by tone when missing/stale/failed.
- Reworked the Today recent captures strip into explicit capture action rows with visible Sort/Open/Find buttons instead of passive receipt-style rows.
- Documented iOS Shortcut failure fallback and the Google OAuth redirect decision blocker.
- Confirmed local-first operation for the initial trust-building phase.
- Created the project scaffold.
- Added scope and reference documents.
- Added initial decisions, architecture notes, Prisma schema, seed data, and database backup script.
