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
npm run verify:hierarchy-release -- --preflight
npm run verify:agent-integration
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

Areas form a nested responsibility tree. An Area may have an optional parent Area; Projects may be filed to an Area or remain unfiled. Tasks, Ideas, and References linked to a Project mirror that Project's optional Area. Before a hierarchy migration, run the read-only preflight and retain all five flags it prints. After migration, pass those flags to the strict gate:

```bash
npm run verify:hierarchy-release -- --preflight
npm run verify:hierarchy-release -- \
  --expected-books=<count> --expected-movies=<count> \
  --expected-areas=<count> --expected-projects=<count> \
  --expected-references=<count>
```

Both modes reject missing Project Area targets and Task/Idea/Reference Area mirrors that disagree with their Project. On the legacy schema, preflight detects absent hierarchy and Read Later columns and substitutes only the checks that are safe against that schema; its count query never names columns that do not exist. Strict postflight requires the additive columns plus the named three-status check constraint and unique active normalized-URL partial index with their intended definitions. It also rejects Area cycles, missing Area parents, duplicate active Read Later normalized URLs, invalid Read Later statuses, or drift in any retained Book, Movie, Area, Project, or Reference count. Both modes open a read-only transaction and require a successful rollback; they do not migrate or repair data.

## Read Later

Read Later is a non-destructive queue stored in `references` with `kind = read_later`. Its states are `unread`, `read`, and `archived`; opening a link never changes state implicitly. Unread and read entries are active, so only one active entry may use a given normalized HTTP(S) URL. The submitted URL is retained, while normalization is used for deduplication. Archiving preserves the item and its filing history and allows the same URL to be saved as a new active entry later. Books and Movies remain separate Reference kinds and never enter this queue.

The web `Save link` flow and explicit `read later <url>` capture intent use the same validation and creation boundary. A generic captured URL remains an ordinary Reference. Metadata enrichment is best-effort: the URL is saved even when title or excerpt lookup fails. Read Later entries may remain global or be filed to an Area or Project, and filing never requires deleting or recreating the entry.

The direct Railway URL is intentionally open during this rollout. Cloudflare Zero Trust Access is the planned access boundary; when it is enabled, the direct Railway origin must also be disabled or blocked so it cannot bypass Cloudflare.

## Agent Access

The REST API is under `/api/v1` and uses bearer API keys registered with `npm run api:key:register`. Current hierarchy routes are `GET/POST /api/v1/areas`, `GET/PATCH /api/v1/areas/:id`, `GET/POST /api/v1/projects`, and `GET/PATCH /api/v1/projects/:id`. Area reads include hierarchy paths; Area writes accept `parentAreaId`; Project writes accept an optional or null `areaId`. Read Later uses `GET/POST /api/v1/read-later`, `GET /api/v1/read-later/:id`, `POST /api/v1/read-later/:id/status`, and `POST /api/v1/read-later/:id/file`; ordinary References can use `POST /api/v1/references/:id/file`. These authenticated, non-destructive contracts are also the future integration point for browser extensions and native share extensions; those clients are not part of this release.

The MCP server runs from `npm run mcp:http`, wraps the REST API, and serves streamable HTTP at `/api/mcp` (Tailnet: `https://mac-studio.tail3baa7a.ts.net:8443/api/mcp`). Its hierarchy tools are `list_areas`, `read_area`, `create_area`, `reparent_area`, `create_project`, `update_project_state`, and `file_project`; its Read Later tools are `list_read_later`, `save_read_later`, `file_reference`, and `set_read_later_status`. The in-app data chat has read-only `list_areas` and returns path-labelled hierarchy entries.

Hermes and other MCP clients must receive `HOME_BASE_API_URL`, `HOME_BASE_MCP_URL`, and `HOME_BASE_API_TOKEN` through approved environment references. `npm run verify:agent-integration` checks local health and, when a bearer reference exists, MCP initialization, discovery, and representative read capabilities. Its non-destructive capture/task write smoke requires the explicit `HOME_BASE_ENABLE_WRITE_SMOKE=1` opt-in. See [the Hermes integration runbook](./docs/hermes-home-base-integration.md) for verified host identity, routes, 1Password-backed registration, secret-free configuration, and troubleshooting.

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
