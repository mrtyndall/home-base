# Home Base

Personal operations system for tasks, calendar, projects, ideas, captures, and search.

Home Base is currently running locally while the core trust loop is built and tested. Railway remains the likely later deployment target, but local is the active mode for now.

## Local Runtime

- App: Next.js 16 App Router
- Database: Homebrew PostgreSQL database `home_base`
- Local env: `.env.local`
- App server: user LaunchAgent `com.mrtyndall.home-base`
- Reminder scheduler: user LaunchAgent `com.mrtyndall.home-base-reminders`
- Local URL: `http://127.0.0.1:3002`
- Tailnet URL: `https://mac-studio.tail3baa7a.ts.net/`
- Tailnet MCP URL: `https://mac-studio.tail3baa7a.ts.net:8443/api/mcp`

## Common Commands

```bash
npm run lint
npm run build
npm run db:deploy
npm run db:seed
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

Local database URL:

```bash
postgresql://matt@localhost:5432/home_base
```

The app expects this in `.env.local` as `DATABASE_URL`. Real deployment credentials should stay out of the repo and live in 1Password/environment variables.

## Agent Access

The REST API is under `/api/v1` and uses bearer API keys registered with `npm run api:key:register`. The MCP server runs from `npm run mcp:http` and wraps the same API.

Google Calendar OAuth is intentionally not configured yet. Matt needs to choose the redirect path in [DECISIONS.md](./DECISIONS.md): localhost setup or Railway/domain redirect.

## Scope

Read [SCOPE.md](./SCOPE.md) first. The capture ledger and data-integrity rules are product requirements, not implementation preferences.
