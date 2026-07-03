# Home Base Architecture

Home Base is a single-user personal operations system for tasks, calendar, projects, ideas, captures, and search. The product requirement is trust: raw captures are preserved before parsing, active views must not show stale completed items, and completed, killed, or parked records remain searchable.

## Stack

- Next.js 16 App Router PWA
- React 19 and Tailwind CSS 4
- PostgreSQL, currently local through Homebrew
- Prisma 7 with `@prisma/adapter-pg`
- Anthropic API for capture parsing and chat-style retrieval
- Pushover and Google Calendar integrations in later implementation steps
- Local LaunchAgent for the current dev server, with Tailscale Serve for remote access
- Railway deployment later, after the local core loop is trusted

## Shape

This is a single Next.js app, not a split frontend/backend service. Server components load database-backed views. Route handlers under `src/app/api` handle capture, integrations, and mobile shortcuts. Shared server code lives under `src/lib`.

## Local Runtime

The current active runtime is local:

- Database: Homebrew PostgreSQL database `home_base`
- Local env: `.env.local` with `DATABASE_URL`
- App server: LaunchAgent `com.mrtyndall.home-base-dev`
- App port: `127.0.0.1:3002`
- Tailnet URL: `https://mac-studio.tail3baa7a.ts.net/`

Useful commands:

```bash
npm run db:deploy
npm run db:seed
launchctl kickstart -k gui/501/com.mrtyndall.home-base-dev
tailscale serve status
```

## Integrity Rules

- `captures` is the sacred append-only ledger. Every capture request writes raw text first.
- Parser failures update the capture status but do not remove or overwrite raw input.
- No app data uses hard deletes. Completed, killed, and parked are statuses.
- AI-created rows link back to `capture_id`.
- Search must include raw captures and inactive records.
- Database backups are part of the foundation, not a later operational cleanup.

## Current Components

- `prisma/schema.prisma`: core Section 12 data model.
- `prisma/seed.ts`: initial domains and app settings.
- `scripts/backup-database.ts`: `pg_dump` backup with optional S3-compatible upload.
- `src/lib/db.ts`: Prisma client configured for PostgreSQL.

## Changelog

### 2026-07-03

- Confirmed local-first operation for the initial trust-building phase.
- Created the project scaffold.
- Added scope and reference documents.
- Added initial decisions, architecture notes, Prisma schema, seed data, and database backup script.
