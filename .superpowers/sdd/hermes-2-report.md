# Hermes Task 2 report — current-host setup and smoke tests

Date: 2026-07-14

## Status

Implemented the secret-safe current-host Hermes integration verifier and runbook. Local app/MCP health is verified. Authenticated MCP discovery, representative live reads, and the optional write smoke were not run because this host has no discoverable dedicated Hermes credential reference and the task forbids creating one in that condition.

## Delivered

- Added `npm run verify:agent-integration`.
- Added URL guards that require exact `/api/v1` and `/api/mcp` routes, forbid credentials/query/fragment material, and allow plaintext HTTP only on loopback.
- Added error redaction for configured tokens, bearer values, and URL userinfo.
- Added MCP initialization, complete tool discovery, and 20 representative read probes spanning every documented read capability group.
- Added an explicitly enabled non-destructive write smoke: preserve a `[HERMES-SMOKE]` capture, create a prefixed task, then complete it. No delete operation exists in the path.
- Documented the live host, LocalHostName/Tailnet distinction, repository and Git remote, local/Tailnet/Railway routes, required `read,write,capture` scopes, a placeholder-only MCP config shape, 1Password-backed registration, and runtime troubleshooting.

## Read-only live evidence

- `hostname`: `Mac-Studio.local`
- `scutil --get ComputerName`: `Mac Studio`
- `scutil --get LocalHostName`: `Mac-Studio`
- `scutil --get HostName`: unset
- `tailscale ip -4`: `100.98.48.102`
- `tailscale serve status`: Tailnet app `https://mac-studio.tail3baa7a.ts.net` proxies to `127.0.0.1:3002`; Tailnet port `8443` proxies to `127.0.0.1:8081`.
- Filtered `launchctl print`: `com.mrtyndall.home-base` and `com.mrtyndall.home-base-mcp` both `running`.
- Local app root: HTTP 200.
- Local MCP `/health`: HTTP 200 with `{"ok":true}`.
- Unauthenticated MCP initialize: HTTP 401, proving the service is reachable and authentication is enforced.

## Credential/config discovery blocker

Read-only discovery found:

- no `hermes`, `hermes-agent`, or `hermes-mcp` executable;
- no Hermes MCP configuration file under the inspected home configuration paths;
- no `HOME_BASE*` or `HERMES*` environment variable name;
- no matching Home Base/Hermes item title in the Personal 1Password vault.

Therefore there is no safe existing credential reference or exact Hermes client config location to use. No credential was created, displayed, registered, or written. Authenticated live initialization/discovery/reads and the opt-in write smoke remain blocked until an operator provisions a dedicated 1Password-backed key and installs/configures the intended Hermes client.

## Verification

- TDD red: `npx tsx --test scripts/verify-agent-integration.test.ts` failed because the verifier module did not yet exist.
- TDD green: the targeted suite passed 6/6.
- Health-only verifier with loopback environment URLs: app HTTP 200; MCP HTTP 200; authenticated checks and write smoke explicitly skipped.
- `npm test`: 226 passed, 0 failed.
- `npx tsx --test mcp/http-server.contract.test.ts`: 9 passed, 0 failed; exact 74-tool non-destructive registry/proxy contract retained.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; Next.js production build and standalone asset copy completed.
- `git diff --check`: exit 0.

## Commit

Conventional commit subject: `docs: add hermes integration runbook`
