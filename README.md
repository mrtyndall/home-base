# Home Base

Personal operations system for tasks, calendar, projects, ideas, captures, and search.

Home Base runs on Railway and uses Railway Postgres as its canonical database. The local LaunchAgent serves the same application build against that canonical database for local and Tailnet access.

## Local Runtime

- App: Next.js 16 App Router
- Database: canonical Railway Postgres (the LaunchAgent resolves its connection at runtime; credentials are not stored in this repository)
- Local env: `.env.local` for non-database development settings
- App server: user LaunchAgent `com.mrtyndall.home-base`
- Reminder scheduler: user LaunchAgent `com.mrtyndall.home-base-reminders`
- Calendar sync scheduler: user LaunchAgent `com.mrtyndall.home-base-calendar-sync`
- Local URL: `http://127.0.0.1:3002`
- Tailnet URL: `https://mac-studio.tail3baa7a.ts.net/`
- Tailnet MCP URL: `https://mac-studio.tail3baa7a.ts.net:8443/api/mcp`
- Railway URL: `https://home-base-production-e3b7.up.railway.app/`

## Common Commands

```bash
npm run lint
npm run build
npm run db:deploy
npm run db:seed
npm run calendar:sync
npm run reminders:send
```

Restart the local app server:

```bash
launchctl kickstart -k gui/501/com.mrtyndall.home-base
```

Check Tailscale Serve:

```bash
tailscale serve status
```

## Database

Railway Postgres is the source of truth for real Home Base data. The Railway service receives `DATABASE_URL` from Railway, and the local LaunchAgent resolves the same Railway-backed connection at launch. Developers may use a disposable local PostgreSQL database for migrations and tests, but must never treat it as a production replica or run destructive verification against Railway.

Database credentials stay in Railway/1Password-backed runtime configuration and must never be committed or copied into documentation. Container startup applies committed migrations and only inserts missing bootstrap defaults; it does not reseed Areas or overwrite settings.

The direct Railway URL is intentionally open during this rollout. Cloudflare Zero Trust Access is the planned access boundary; when it is enabled, the direct Railway origin must also be disabled or blocked so it cannot bypass Cloudflare.

## Agent Access

The REST API is under `/api/v1` and uses bearer API keys registered with `npm run api:key:register`. The MCP server runs from `npm run mcp:http` and wraps the same API.

## Google Calendar

Matt chose the hosted Railway/domain redirect path. Add this authorized redirect URI in Google Cloud Console:

```text
https://home-base-production-e3b7.up.railway.app/api/google/oauth/callback
```

Required environment variables:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_TOKEN_ENCRYPTION_KEY
GOOGLE_OAUTH_STATE_SECRET
GOOGLE_CALENDAR_ID=primary
```

Then visit `/api/google/oauth/start` on the hosted app to complete OAuth. The callback stores only an encrypted refresh token, then the 15-minute sync job uses `npm run calendar:sync`.

On Railway, configure a cron job with schedule `*/15 * * * *` and command `npm run calendar:sync` after the Google secrets are live.

## Scope

Read [SCOPE.md](./SCOPE.md) first. The capture ledger and data-integrity rules are product requirements, not implementation preferences.
