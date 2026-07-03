# Home Base

Personal operations system for tasks, calendar, projects, ideas, captures, and search.

Home Base is currently running locally while the core trust loop is built and tested. Railway remains the likely later deployment target, but local is the active mode for now.

## Local Runtime

- App: Next.js 16 App Router
- Database: Homebrew PostgreSQL database `home_base`
- Local env: `.env.local`
- Dev server: user LaunchAgent `com.mrtyndall.home-base-dev`
- Local URL: `http://127.0.0.1:3002`
- Tailnet URL: `https://mac-studio.tail3baa7a.ts.net/`

## Common Commands

```bash
npm run lint
npm run build
npm run db:deploy
npm run db:seed
```

Restart the local app server:

```bash
launchctl kickstart -k gui/501/com.mrtyndall.home-base-dev
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

## Scope

Read [SCOPE.md](./SCOPE.md) first. The capture ledger and data-integrity rules are product requirements, not implementation preferences.
