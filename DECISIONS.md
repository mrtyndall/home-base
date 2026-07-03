# Home Base Decisions

These are the initial build defaults from SCOPE.md Section 16. They are written down so they can be corrected deliberately instead of becoming hidden assumptions.

## Open Decisions

| Decision | Initial build default | Status |
|---|---|---|
| Final domain list | Inbox, Home, Family, Health, Creative, Hobbies/Homelab | Confirm with Matt |
| Clustering nudge threshold | Conservative and disabled until the core capture/search flow is trusted; start with 5 related captures in 7 days when enabled | Confirm later |
| Visual direction | Designed and calm | Confirm with Matt |
| Parked-project weighting | Lost context is the main problem; parked projects stay browsable but excluded from Today attention and slipping detection | Confirm with Matt |
| References tab | No dedicated tab for now; references live under Search/Browse | Confirm with Matt |

## Architecture Decisions

- Use a single Next.js App Router codebase with route handlers instead of a separate Fastify/Hono backend. This matches Production Hub's deployment shape and keeps Railway operations simple.
- Use PostgreSQL on Railway with Prisma 7 and the `@prisma/adapter-pg` adapter.
- Keep the capture ledger as the first persistence step for every capture request. Parser failure must not roll back the raw capture row.
- Use S3-compatible backups through `scripts/backup-database.ts`, with Cloudflare R2 as the expected off-Railway target.
