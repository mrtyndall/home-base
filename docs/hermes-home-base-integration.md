# Hermes ↔ Home Base integration

Home Base exposes Hermes capabilities through the typed MCP service. MCP forwards the caller's bearer credential to the audited `/api/v1` REST boundary; it does not access Prisma or application helpers directly.

## Verified current-host routes

These facts were checked read-only on 2026-07-14. Re-run the commands in [Runtime checks](#runtime-checks) before treating them as current.

| Purpose | Verified value |
|---|---|
| Canonical repository | `/Users/matt/projects/home-base` |
| Git remote | `git@github.com:mrtyndall/home-base.git` |
| Local app | `http://127.0.0.1:3002/` |
| Local REST base | `http://127.0.0.1:3002/api/v1` |
| Local MCP health | `http://127.0.0.1:8081/health` |
| Local MCP endpoint | `http://127.0.0.1:8081/api/mcp` |
| Tailnet app | `https://mac-studio.tail3baa7a.ts.net/` |
| Tailnet MCP | `https://mac-studio.tail3baa7a.ts.net:8443/api/mcp` |
| Tailnet IPv4 | `100.98.48.102` |
| Railway browser origin | `https://home-base-production-e3b7.up.railway.app/` |

`launchctl print` reported `com.mrtyndall.home-base` and `com.mrtyndall.home-base-mcp` running. The app root returned HTTP 200 and MCP `/health` returned `{"ok":true}`.

The identities describe the same current Mac but are not interchangeable configuration fields. `hostname` reports `Mac-Studio.local`, macOS `ComputerName` is `Mac Studio`, `LocalHostName` is `Mac-Studio`, and the explicit macOS `HostName` is unset. Tailscale independently publishes the lowercase Tailnet DNS identity `mac-studio.tail3baa7a.ts.net`. Use the route emitted by `tailscale serve status`; do not derive it from `hostname` or stale host documentation.

## Contract and scopes

- Required scopes are `read`, `write`, and `capture` for the complete 74-tool registry.
- Credentials must come from an approved environment reference. Never put a token in this repository, a shell command argument, a log, chat output, or an MCP configuration file.
- There are no active Domain tools and no tool name containing `delete`.
- Writes are validated, rate-limited, and audited by REST. MCP tools remain thin proxies.
- Capability and audit mapping lives in [home-base-capability-matrix.md](./home-base-capability-matrix.md).

## Environment-only client configuration

Hermes must receive these names from its approved runtime environment:

```text
HOME_BASE_API_URL=http://127.0.0.1:3002/api/v1
HOME_BASE_MCP_URL=https://mac-studio.tail3baa7a.ts.net:8443/api/mcp
HOME_BASE_API_TOKEN=<credential supplied by the approved 1Password-backed runtime>
```

The following is a secret-free configuration shape, not a file to save after interpolation. It assumes the Hermes MCP configuration layer expands environment references. If that client does not support expansion, inject the same values into its process environment or generated in-memory configuration; never paste the expanded bearer value into JSON.

```json
{
  "mcpServers": {
    "home-base": {
      "transport": "streamable-http",
      "url": "${HOME_BASE_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${HOME_BASE_API_TOKEN}"
      }
    }
  }
}
```

No Hermes executable or Hermes MCP configuration file was discoverable on this host on 2026-07-14, so an exact client-specific path or schema cannot be asserted safely. The generic shape above must be reconciled with the installed Hermes version before activation.

## 1Password-backed credential setup

There was no existing Home Base/Hermes environment variable or matching 1Password item visible during the read-only audit. This task therefore did not create, display, or register a credential.

When an operator provisions the integration:

1. Create a dedicated random credential directly in the Personal vault. Do not generate it in a logged command or paste it into repository files.
2. Add this environment reference to `~/.secrets`, substituting only the actual 1Password item name locally:

   ```bash
   export HOME_BASE_API_TOKEN="$(_op_read 'op://Personal/<Home Base Hermes item>/credential')"
   ```

3. Load the approved runtime without echoing the variable. From the canonical repository, register only its hash with all required scopes:

   ```bash
   npm run api:key:register -- hermes read,write,capture
   ```

4. Supply `HOME_BASE_API_URL` and `HOME_BASE_MCP_URL` through the Hermes service environment, and pass `HOME_BASE_API_TOKEN` through the same 1Password-backed runtime.
5. Run read-only verification first. Enable the write smoke only after confirming the key is dedicated and the three scopes are correct.

The registration script reports label, scopes, and rate limit only. It never prints the token and stores only its hash.

## Verification command

`npm run verify:agent-integration` validates URL safety, checks app and MCP health, performs MCP initialization and tool discovery, and invokes one representative read for each documented read capability group. It does not print tool payloads or credentials.

```bash
npm run verify:agent-integration
```

Without `HOME_BASE_API_TOKEN`, the command still verifies unauthenticated app/MCP health and explicitly skips authenticated discovery, reads, and writes. With a dedicated environment-backed token, it performs initialization, discovery, and the representative reads.

The write smoke is off by default. Its only opt-in value is `1`:

```bash
HOME_BASE_ENABLE_WRITE_SMOKE=1 npm run verify:agent-integration
```

That smoke preserves a `[HERMES-SMOKE]` capture, creates a `[HERMES-SMOKE]` task, and completes the task. It never deletes either record. Run it only with the dedicated `read,write,capture` key.

## Runtime checks

These commands reveal service and routing state without printing service environments:

```bash
launchctl print gui/$(id -u)/com.mrtyndall.home-base | awk '/^[[:space:]]*(state|path|program|pid|last exit code) =/'
launchctl print gui/$(id -u)/com.mrtyndall.home-base-mcp | awk '/^[[:space:]]*(state|path|program|pid|last exit code) =/'
curl --fail --silent --show-error http://127.0.0.1:3002/ >/dev/null
curl --fail --silent --show-error http://127.0.0.1:8081/health
hostname
scutil --get ComputerName
scutil --get LocalHostName
scutil --get HostName
tailscale ip -4
tailscale serve status
```

Do not paste full LaunchAgent plists, `launchctl` environment sections, shell environments, or authenticated HTTP traces into tickets or logs.

Troubleshooting order:

1. If local health fails, check the two LaunchAgent states and loopback listeners before changing Tailnet configuration.
2. If local health passes but Tailnet fails, trust `tailscale serve status` for the current hostname, port, and proxy target.
3. HTTP 401 from `/api/mcp` means MCP is reachable but the bearer reference is absent or invalid. HTTP 403 usually means the key lacks a required scope.
4. If discovery succeeds but a read fails, compare the tool against [home-base-capability-matrix.md](./home-base-capability-matrix.md) and inspect redacted application logs.
5. If the local runtime is stale after a release, rebuild and restart both LaunchAgents as described in the root architecture guide.

## Verification boundary

The executable registry contract is:

```bash
npx tsx --test mcp/http-server.contract.test.ts
```

That check matches the exact 74-tool registry against a complete expected manifest and invokes every actual handler with a fake REST boundary. It verifies bearer preservation, method/path/query/body forwarding, centralized dynamic-ID rejection and encoding, non-destructive naming, and redacted structured error behavior. It does not prove that the current host, Tailnet route, LaunchAgent, Railway deployment, API key, or production database is healthy; use the live checks above for those claims.
