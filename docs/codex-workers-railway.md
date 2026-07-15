# Codex Workers on Railway

Home Base uses two private worker services built from `worker/Dockerfile`:

- `home-base-sorter`: creates review proposals for unresolved captures.
- `home-base-assistant`: answers read-only Home Base questions through a curated REST policy broker.

Both use ChatGPT-backed Codex authentication. They do not use `OPENAI_API_KEY`, receive `DATABASE_URL`, expose a public domain, or share a Codex volume.

## Release Preconditions

1. The release commit is clean, pushed, and is the exact commit deployed to all three services.
2. A fresh production backup and preservation baselines exist.
3. `npm test`, `npm run lint`, `npm run build`, `npm run worker:build`, and the worker Docker build pass.
4. The main app migration is deployed before either worker claims a job.
5. The direct Railway app origin is protected equivalently to Cloudflare Access before enabling Codex chat.

## Service Configuration

Both worker services use the repository root as build context and `worker/Dockerfile` as the Dockerfile. Configure one replica, restart-on-failure, and `/healthz` as the deployment health check. Do not set a public/custom domain.

Attach a distinct persistent volume to each service at `/data/codex`:

- Sorter volume: owned only by `home-base-sorter`
- Assistant volume: owned only by `home-base-assistant`

Never mount one volume in both services and never copy a live `auth.json` between them. Codex refreshes its cached ChatGPT session in place.

### Sorter variables

```text
WORKER_ROLE=sorter
HOME_BASE_URL=http://${{home-base.RAILWAY_PRIVATE_DOMAIN}}:${{home-base.PORT}}
HOME_BASE_WORKER_TOKEN=<sorter service credential from 1Password>
CODEX_HOME=/data/codex
CODEX_MODEL=gpt-5.4
RAILWAY_RUN_UID=0
```

### Assistant variables

```text
WORKER_ROLE=assistant
HOME_BASE_URL=http://${{home-base.RAILWAY_PRIVATE_DOMAIN}}:${{home-base.PORT}}
HOME_BASE_WORKER_TOKEN=<assistant service credential from 1Password>
HOME_BASE_API_TOKEN=<dedicated read-only Home Base API credential from 1Password>
CODEX_HOME=/data/codex
CODEX_MODEL=gpt-5.4
RAILWAY_RUN_UID=0
```

Railway mounts volumes as root. `RAILWAY_RUN_UID=0` lets the image entrypoint
repair `/data/codex` ownership at startup; the entrypoint immediately drops to
the unprivileged `homebase` user before it starts the worker.

The worker-token values must be distinct high-entropy values. Home Base receives only their SHA-256 hashes:

```text
HOME_BASE_SORTER_TOKEN_SHA256=<sorter credential hash>
HOME_BASE_ASSISTANT_TOKEN_SHA256=<assistant credential hash>
```

The assistant API token is registered in `api_keys` with only the `read` scope. It must not have `write` or `capture` scope.

Keep both feature flags false until the matching service is ready:

```text
HOME_BASE_CHAT_ENABLED=false
HOME_BASE_CODEX_SORTER_ENABLED=false
HOME_BASE_CODEX_ASSISTANT_ENABLED=false
```

`HOME_BASE_CHAT_ENABLED` gates both the Claude fallback and Codex chat status
routes. Keep it false while the direct Railway origin is publicly reachable.

## Separate ChatGPT Logins

After the services and volumes are running, open a Railway SSH session into each service separately and run the bundled Codex login against that service's volume:

```bash
CODEX_HOME=/data/codex /app/node_modules/.bin/codex \
  -c 'cli_auth_credentials_store="file"' login --device-auth
```

Complete the displayed device flow immediately. Never paste `auth.json`, access tokens, or refresh tokens into chat, Railway variables, logs, or the repository. Repeat the login independently for the other worker.

Check the session without printing credential content:

```bash
CODEX_HOME=/data/codex /app/node_modules/.bin/codex login status
```

Restart that service, then verify `/readyz` from inside Railway private networking. `/healthz` proves only that the process is alive. Before its first queue claim, the worker runs one minimal structured Codex turn to prove that the ChatGPT session and configured model are actually usable; successful verification is cached until an authentication failure. `/readyz` remains 503 until that live probe and a Home Base queue request both succeed.

## Enablement Order

1. Enable `HOME_BASE_CODEX_SORTER_ENABLED=true`.
2. Submit an intentionally ambiguous capture.
3. Confirm one `CaptureReviewProposal` appears and no Task, Idea, Note, Reference, Area, or Project is created automatically.
4. Accept or correct the proposal and confirm one routing-feedback record is retained.
5. Protect the direct Railway origin behind the same identity boundary as the Cloudflare hostname.
6. Enable `HOME_BASE_CHAT_ENABLED=true`.
7. Enable `HOME_BASE_CODEX_ASSISTANT_ENABLED=true`.
8. Ask a read-only question and confirm the answer arrives through the queued chat turn.
9. Attempt a write-style chat request and confirm the assistant states it is read-only and no record changes.

## Rotation and Recovery

- Worker service credential: create a replacement in 1Password, set the raw value only on its worker, set only the new hash on Home Base, redeploy both sides, verify, then remove the old item.
- Home Base assistant API token: register a new read-only key, replace the assistant variable, verify reads, then revoke the old key.
- Codex session: run `codex logout` and `codex login --device-auth` inside only the affected service. Do not overwrite the other worker's volume.
- Missing/expired auth: readiness fails and the worker stops claiming jobs. Queued work remains durable and reclaimable.
- Failed jobs: inspect queue counts through the authenticated internal health route. Retry-wait jobs back off; exhausted jobs remain `dead_letter` for diagnosis.

## Rollback

Set `HOME_BASE_CHAT_ENABLED=false` and both Codex feature flags false first. Queued jobs and chat messages remain retained, and no worker table is hard-deleted. Roll back application code only after disabling claims. The additive database migration can remain in place safely.

## Secret-Safety Rules

- Store credentials in 1Password and inject them through Railway sealed variables.
- Use stdin when setting secret Railway variables.
- Never print Railway variable values, `auth.json`, authorization headers, or worker request bodies.
- Worker logs may include role, job ID, job kind, and error class only; they must not include captured text, chat text, model prompts, tool results, or credentials.
