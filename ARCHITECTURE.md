# Home Base Architecture

Home Base is a single-user personal operations system for tasks, calendar, projects, ideas, captures, and search. The product requirement is trust: raw captures are preserved before parsing, active views must not show stale completed items, and completed, killed, or parked records remain searchable.

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
- Agent writes use `source = api:<key label>` where the table has a source field, and every API write creates a notification feed entry.
- Search must include raw captures and inactive records.
- Local database backups are part of the foundation, not a later operational cleanup.
- TODO tripwire: enable off-machine database backups as soon as Home Base becomes a daily-reliance system.

## Reminder Delivery

Reminder offsets are delivered by `scripts/send-reminders.ts`, intended to run once per minute. The job finds open tasks whose reminder time is due and writes append-only `reminder_deliveries` records after delivery. If the app was down during the reminder window, the recovery send uses overdue reminder framing instead of silently skipping.

Tasks with a due date and no due time use the `default_due_date_reminder_time` app setting, defaulting to `08:00` America/New_York. Every push delivery also creates a notification feed entry.

## Agent Access

The REST API lives under `/api/v1` and uses bearer API keys stored as hashes in `api_keys`. Minimum scopes are `read`, `write`, and `capture`; write rate limits are conservative by default. API routes intentionally expose no delete method.

The MCP server lives in `mcp/http-server.ts` and wraps the REST API over streamable HTTP at `/api/mcp`. It provides tools for all-clear summary, search, task creation/completion, project state updates, park/unpark, idea capture/conversion, and calendar reads.

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

## Parked Projects

Project statuses are `active`, `parked`, `completed`, and `killed`. Parked projects stay browsable on a separate Projects shelf, carry current state and next step, and are excluded from slipping logic. Parking can happen through UI, capture, REST API, or MCP.

## Current Components

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
- `mcp/http-server.ts`: streamable HTTP MCP wrapper around the REST API.
- `src/lib/calendar/google.ts`: Google OAuth, encrypted token storage, push/pull sync, and conflict handling.
- `src/lib/db.ts`: Prisma client configured for PostgreSQL.
- `src/lib/reminders.ts`: due reminder selection, Pushover delivery, and audit writes.
- `src/lib/tasks.ts`: shared task creation/completion and recurrence behavior.

## Changelog

### 2026-07-03

- Added progressive task depth: a fast Inbox-default quick task row, task detail pages for all extended task fields, linked task rows from Today/Tasks, and notification-audited manual detail updates.
- Implemented the hosted Google OAuth path chosen by Matt: OAuth start/callback routes, encrypted refresh-token storage, sync-token based pull, local-event push to Google, and a 15-minute scheduler command.
- Created the Railway `home-base` project with Postgres and deployed the app at `https://home-base-production-e3b7.up.railway.app/`.
- Added Milestone 2 foundations: reminder deliveries, API keys, calendar sync state, REST API, MCP server, parked project UI, subtask UI, recurrence-on-completion behavior, and Apple Reminders CSV import.
- Added Pushover reminder scheduler logic with append-only delivery audit rows and in-app notification mirroring.
- Added Today calendar sync freshness display and recently captured outcome labels.
- Documented iOS Shortcut failure fallback and the Google OAuth redirect decision blocker.
- Confirmed local-first operation for the initial trust-building phase.
- Created the project scaffold.
- Added scope and reference documents.
- Added initial decisions, architecture notes, Prisma schema, seed data, and database backup script.
