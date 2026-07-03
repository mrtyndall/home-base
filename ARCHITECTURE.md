# Home Base Architecture

Home Base is a single-user personal operations system for tasks, calendar, areas, projects, ideas, captures, and search. The product requirement is trust: raw captures are preserved before parsing, active views must not show stale completed items, and completed, killed, someday, or parked records remain searchable.

## Stack

- Next.js 16 App Router PWA
- React 19 and Tailwind CSS 4
- PostgreSQL, currently local through Homebrew
- Prisma 7 with `@prisma/adapter-pg`
- Anthropic API for capture parsing
- Pushover for reminder delivery
- Google Calendar OAuth, encrypted refresh-token storage, 15-minute scheduled sync, and local calendar event storage
- REST API plus streamable HTTP MCP server for agent access
- Local LaunchAgents for the production app server and reminder scheduler, with Tailscale Serve for remote access
- Railway deployment later, after the local core loop is trusted

## Shape

This is a single Next.js app, not a split frontend/backend service. Server components load database-backed views. Route handlers under `src/app/api` handle capture, integrations, and mobile shortcuts. Shared server code lives under `src/lib`.

## Local Runtime

The current active runtime is local:

- Database: Homebrew PostgreSQL database `home_base`
- Local env: `.env.local` with `DATABASE_URL`
- App server: LaunchAgent `com.mrtyndall.home-base`, using the production standalone server with `.env.local` loaded at start
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

## Integrity Rules

- `captures` is the sacred append-only ledger. Every capture request writes raw text first.
- Parser failures update the capture status but do not remove or overwrite raw input.
- No app data uses hard deletes. Completed, killed, and parked are statuses.
- AI-created rows link back to `capture_id`.
- The hierarchy is capped at Domains -> Areas -> Projects -> Tasks. Areas and projects have no self-referencing parent columns.
- Tasks attach to an area or a project; project assignment implies the task area. A database trigger keeps task/project area alignment intact.
- Agent writes use `source = api:<key label>` where the table has a source field, and every API write creates a notification feed entry.
- Search must include raw captures and inactive records.
- Local database backups are part of the foundation, not a later operational cleanup.
- TODO tripwire: enable off-machine database backups as soon as Home Base becomes a daily-reliance system.

## Reminder Delivery

Reminder offsets are delivered by `scripts/send-reminders.ts`, intended to run once per minute. The job finds open tasks whose reminder time is due and writes append-only `reminder_deliveries` records after delivery. If the app was down during the reminder window, the recovery send uses overdue reminder framing instead of silently skipping.

Tasks with a due date and no due time use the `default_due_date_reminder_time` app setting, defaulting to `08:00` America/New_York. Every push delivery also creates a notification feed entry.

## Agent Access

The REST API lives under `/api/v1` and uses bearer API keys stored as hashes in `api_keys`. Minimum scopes are `read`, `write`, and `capture`; write rate limits are conservative by default. API routes intentionally expose no delete method.

The MCP server lives in `mcp/http-server.ts` and wraps the REST API over streamable HTTP at `/api/mcp`. It provides tools for all-clear summary, search, task creation/completion, area reads/state updates, project creation/state updates, park/unpark, idea capture/conversion, shared markdown notes/docs, milestones, and calendar reads.

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

The Railway app service is deployed. Railway cron still needs to be configured in the service settings after Google secrets are added: `*/15 * * * *` running `npm run calendar:sync`.

## Hierarchy And Containers

Domains are organization headers only. Areas are ongoing responsibilities with `active`, `parked`, and `retired` statuses. Projects are finishable containers with `someday`, `active`, `parked`, `completed`, and `killed` statuses. Someday and parked projects stay browsable, carry current state and next step, and are excluded from slipping logic. Areas never participate in slipping logic.

Areas and projects share container tables for markdown notes (`entity_notes`), markdown docs (`entity_docs`), and file attachment metadata (`documents`). Project-only depth lives in `milestones`. Text-bearing state and docs are plain markdown for portability, full-text search, agent access, and future Obsidian export. Area/project state fields are optional and are shown only when the system already has real data; list cards favor derived task, activity, and note signals.

## Current Components

- `src/app/page.tsx`: Home landing page with derived entry cards for Today, Tasks, Projects, Ideas, and Inbox.
- `src/app/today/page.tsx`: Today screen with the all-clear state, calendar freshness, due-today/tomorrow horizon, and recently captured strip.
- `prisma/schema.prisma`: core Section 12 data model.
- `prisma/seed.ts`: initial domains and app settings.
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
- `src/app/settings/page.tsx`: integration control surface with per-variable configuration status (names only, never values), Google Calendar connect flow, Pushover test delivery, API key list with revoke, and MCP posture/health.
- `src/app/settings/actions.ts`: server actions for the Pushover test notification and API key revocation, both audited through the notifications feed.
- `src/app/api/settings/mcp-health/route.ts`: read-only probe of the MCP server `/health` endpoint (`MCP_HEALTH_URL` override, defaults to the local port).

## Changelog

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
- Documented iOS Shortcut failure fallback and the Google OAuth redirect decision blocker.
- Confirmed local-first operation for the initial trust-building phase.
- Created the project scaffold.
- Added scope and reference documents.
- Added initial decisions, architecture notes, Prisma schema, seed data, and database backup script.
