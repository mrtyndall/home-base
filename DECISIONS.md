# Home Base Decisions

These are the initial build defaults from SCOPE.md Section 16. They are written down so they can be corrected deliberately instead of becoming hidden assumptions.

## Open Decisions

| Decision | Initial build default | Status |
|---|---|---|
| Final domain list | Inbox, Home, Family, Health, Creative, Hobbies/Homelab | Confirm with Matt |
| Clustering nudge threshold | Conservative and disabled until the core capture/search flow is trusted; start with 5 related captures in 7 days when enabled | Confirm later |
| Visual direction | Designed and calm | Confirm with Matt; design pass remains paused |
| Google OAuth redirect URI | Option A: localhost redirect during setup. Option B: accelerate Railway/domain and use a real hosted redirect. | Matt must choose before Google OAuth implementation |
| Parked-project weighting | Lost context is the main problem; parked projects stay browsable but excluded from Today attention and slipping detection | Confirmed |
| References tab | No dedicated tab for now; references live under Search/Browse | Confirm with Matt |

## Architecture Decisions

- Use a single Next.js App Router codebase with route handlers instead of a separate Fastify/Hono backend. This matches Production Hub's deployment shape and keeps Railway operations simple.
- Current operating mode is local-first: Homebrew PostgreSQL, local `.env.local`, a user LaunchAgent running `npm run build && npm run start`, and Tailscale Serve for remote access.
- Railway remains the expected later hosting target, but deployment work is paused until the local core loop earns trust.
- Use PostgreSQL with Prisma 7 and the `@prisma/adapter-pg` adapter.
- Keep the capture ledger as the first persistence step for every capture request. Parser failure must not roll back the raw capture row.
- Chat-style in-app search is paused. Agent access through REST API plus MCP is the third search mode for now.
- Use local `pg_dump` backups through `scripts/backup-database.ts`. Off-machine database backups are paused during alpha and should resume when daily reliance begins.
- Pushover reminder delivery is the first production notification channel. Missing Pushover credentials must not create failed reminder delivery records.
