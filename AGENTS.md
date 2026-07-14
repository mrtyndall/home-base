<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deployment verification

Railway production is exactly:
- Project: `home-base` (`293a006f-f2d5-408d-abcb-8de2218be25f`)
- Environment: `production` (`4bea8124-cb21-4c56-83d3-7105aed019ff`)
- App service: `home-base` (`1dc07615-ae44-4dd1-b95b-6d85bac7a07b`)
- Production domain: `https://home-base-production-e3b7.up.railway.app`

After any deploy, before reporting success:
1. Confirm the active Railway deployment serves the intended commit. `railway up` uploads carry no git metadata, so verify by content fingerprint: curl the production URL and check for markers unique to the new commit (a new route, nav label, or API endpoint), and note the deploy timestamp against your upload.
2. Confirm the deploy logs show `prisma migrate deploy` applying any new migrations cleanly.
3. Smoke-test the production URL: key pages return 200 and render expected content.
4. Deploy only from a clean `git worktree` at the exact commit — the working tree often has another agent's uncommitted edits.

Any future claim that Railway production is current must paste the raw external curl output from `https://home-base-production-e3b7.up.railway.app` in the report. Localhost, tailnet, Railway status, and Railway internal URLs do not count.

Never run destructive database commands against production (`migrate reset`, `db push --force-reset`, drops). Migrations must be additive.

A "stale UI" report against a verified-current origin is usually a long-lived client instance (iOS home-screen web apps keep their loaded bundle until force-closed; there is no service worker in this app). Verify the origin with a cache-bypassed curl before touching the deployment.

Note: this app has TWO origins — Railway (`home-base-production-e3b7.up.railway.app`) and the local LaunchAgent runtime on this Mac (`127.0.0.1:3002`, exposed at `https://mac-studio.tail3baa7a.ts.net` via Tailscale). Both use the canonical Railway production database; the LaunchAgent resolves that connection at runtime. The local runtime serves whatever build its long-running process loaded at start; after deploying new code, also run `npm run build` and `launchctl kickstart -k gui/501/com.mrtyndall.home-base` (and `…-mcp` for the MCP server) or the tailnet URL will serve stale UI. Railway deploy owns production migration application; do not run destructive or development migration commands from the local runtime.

Container startup may run committed migrations and insert missing bootstrap defaults only. It must not recreate Areas or overwrite user-managed taxonomy, Area state, or settings.

Before an Area-first production deploy, create a fresh database backup and run `npm run verify:area-release -- --preflight` against the canonical Railway database. Record the Book and Movie baseline flags printed by that old-schema-safe preflight. After migrations complete, run `npm run verify:area-release -- --expected-books=<recorded-count> --expected-movies=<recorded-count>` against the same database. Do not treat deployment status or page smoke checks as a substitute for this preservation gate.

The direct Railway domain is intentionally open for the Area-first rollout. Cloudflare Zero Trust Access is the planned access boundary; when enabled, the Railway origin must be disabled or blocked from direct access so it cannot bypass Cloudflare.
