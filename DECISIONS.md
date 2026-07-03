# Home Base Decisions

These are the initial build defaults from SCOPE.md Section 16. They are written down so they can be corrected deliberately instead of becoming hidden assumptions.

## Open Decisions

| Decision | Initial build default | Status |
|---|---|---|
| Final domain list | Inbox, Home, Family, Health, Creative, Hobbies/Homelab | Confirm with Matt |
| Clustering nudge threshold | Conservative and disabled until the core capture/search flow is trusted; start with 5 related captures in 7 days when enabled | Confirm later |
| Visual direction | Designed and calm | Confirm with Matt; design pass remains paused |
| Google OAuth redirect URI | Option B: Railway/domain hosted redirect. Use `https://home-base-production-e3b7.up.railway.app/api/google/oauth/callback`. | Chosen by Matt on 2026-07-03 |
| Parked-project weighting | Open: clarify whether the pain of dormant projects is lost context, lost visibility, or too many open threads | Open |
| References tab | No dedicated tab for now; references live under Search/Browse | Confirm with Matt |
| File attachment storage | Cloudflare R2 for object storage; Railway volume remains the fallback if Matt wants fewer external services | Confirm with Matt |
| Initial area map | Suggested domains: Home, Family, Health, Hobbies, Creative. Current seeded areas include Inbox, Ham Radio, Homelab, and Magic/Pokemon. | Confirm with Matt |
| Catch-all areas | Inbox system area is the only catch-all; no per-domain "General" areas | Confirm with Matt explicitly; already enforced by SCOPE.md |

## M5 Decisions (2026-07-03)

- **Routines module ACTIVATED** (SCOPE.md Section 18), with the streak amendment (SCOPE.md Section 19.3): completion history and current run length may render as plain fact; broken-chain framing, red states, and gap-as-failure rendering are banned forever. Grace windows configurable; a gap renders as nothing.
- **People CRM module ACTIVATED** (SCOPE.md Section 18). Nudges from this module use the existing time-sensitive trigger only.
- **Quotes and books DEFERRED** (not dropped) to a future memory-layer phase. Memory layer phase 1 is journal + resurfacing only.
- **In-app data chat REVIVED.** Previously paused in favor of MCP; MCP remains, and chat is a thin read-only client over the same capability set. Writes remain capture's job.

## Architecture Decisions

- Use a single Next.js App Router codebase with route handlers instead of a separate Fastify/Hono backend. This matches Production Hub's deployment shape and keeps Railway operations simple.
- Current operating mode is local-first: Homebrew PostgreSQL, local `.env.local`, a user LaunchAgent running `npm run build && npm run start`, and Tailscale Serve for remote access.
- Railway/domain hosting is the chosen path for Google OAuth. Local tailnet operation remains active while Railway variables and Google Cloud Console credentials are configured.
- Use PostgreSQL with Prisma 7 and the `@prisma/adapter-pg` adapter.
- Keep the capture ledger as the first persistence step for every capture request. Parser failure must not roll back the raw capture row.
- Chat-style in-app search is paused. Agent access through REST API plus MCP is the third search mode for now.
- Agent access follows the same hierarchy as the UI: domains are headers, areas and projects are writable containers, shared markdown notes/docs are first-class searchable depth, and all API writes create notification audit entries.
- Use local `pg_dump` backups through `scripts/backup-database.ts`. Off-machine database backups are paused during alpha and should resume when daily reliance begins.
- Pushover reminder delivery is the first production notification channel. Missing Pushover credentials must not create failed reminder delivery records.
- Google OAuth refresh tokens are stored encrypted in the database. The encryption key itself must live in 1Password/Railway environment variables, not the repo.
