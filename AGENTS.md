<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deployment verification

After any deploy, before reporting success:
1. Confirm the active Railway deployment serves the intended commit. `railway up` uploads carry no git metadata, so verify by content fingerprint: curl the production URL and check for markers unique to the new commit (a new route, nav label, or API endpoint), and note the deploy timestamp against your upload.
2. Confirm the deploy logs show `prisma migrate deploy` applying any new migrations cleanly.
3. Smoke-test the production URL: key pages return 200 and render expected content.
4. Deploy only from a clean `git worktree` at the exact commit — the working tree often has another agent's uncommitted edits.

Never run destructive database commands against production (`migrate reset`, `db push --force-reset`, drops). Migrations must be additive.

A "stale UI" report against a verified-current origin is usually a long-lived client instance (iOS home-screen web apps keep their loaded bundle until force-closed; there is no service worker in this app). Verify the origin with a cache-bypassed curl before touching the deployment.

Note: this app has TWO origins — Railway (`home-base-production-e3b7.up.railway.app`) and the local LaunchAgent runtime on this Mac (`127.0.0.1:3002`, exposed at `https://mac-studio.tail3baa7a.ts.net` via Tailscale, backed by the LOCAL database). The local runtime serves whatever build its long-running process loaded at start; after deploying new code, also run `npm run build` and `launchctl kickstart -k gui/501/com.mrtyndall.home-base` (and `…-mcp` for the MCP server) or the tailnet URL will serve stale UI.
