# Codex Home Base Workers Design

## Goal

Run two private, Railway-hosted Codex workers for Home Base:

1. A sorter that turns unresolved captures into safe filing proposals and improves from Matt's explicit corrections.
2. An assistant that answers questions about Home Base through a curated, audited read-only tool boundary.

The workers use ChatGPT-backed Codex authentication rather than an OpenAI Platform API key. Existing Claude parsing and chat remain available as fallbacks until each Codex worker is healthy.

## Scope

This release establishes the secure production foundation. The sorter handles only captures the deterministic and Claude parser could not resolve. Its output is always a proposal for review; it cannot create or edit Home Base entities. The assistant is read-only in this release. Write proposals, confirmation cards, and undoable mutations are a later, separately reviewed capability.

The release includes durable jobs, leases, retries, chat records, routing feedback, worker health, two private Railway services, separate persistent Codex authentication volumes, and deployment documentation.

## Architecture

The same worker image is deployed twice with `WORKER_ROLE=sorter` and `WORKER_ROLE=assistant`. Each service runs one replica and owns its own persistent `CODEX_HOME` volume. The services never share or copy a writable Codex authentication state.

Home Base owns all durable state and policy. Workers never receive `DATABASE_URL`.

```text
Browser -> Home Base -> PostgreSQL job queue
                         |             |
                         v             v
                    Sorter worker  Assistant worker
                         |             |
                         v             v
                   strict proposal  curated read tools
                         |             |
                         +-----> Home Base REST boundary
```

The workers poll authenticated internal job endpoints. A claim uses a random lease token; Home Base stores only its SHA-256 hash. Heartbeats, completion, and failure must present the matching token. Expired leases are reclaimable. Job completion and the resulting proposal or chat message commit together.

## Codex Runtime Boundary

Both roles use the pinned `@openai/codex-sdk` package. Each turn runs with:

- `features.shell_tool=false`
- `features.unified_exec=false`
- apps, plugins, multi-agent, hooks, memories, goals, and web search disabled
- `sandboxMode=read-only`
- `approvalPolicy=never`
- no network access in the Codex child
- a minimal child environment that excludes Home Base service credentials
- an empty, non-repository working directory

The parent worker controller is the only process that can call Home Base. Codex returns strict JSON describing either a sorter proposal, read-tool calls, or a final answer. The controller validates every object with Zod, executes allow-listed reads, and feeds tool results back as explicitly untrusted data.

This design does not attach Home Base MCP directly to Codex. It provides equivalent curated reads through a policy broker, preventing stored prompt injection from turning an MCP or shell capability into credential access. The existing MCP service remains the integration boundary for Hermes/BMO.

## Sorter Flow

1. Home Base persists the raw capture before any remote model call.
2. Existing deterministic and Claude parsing runs.
3. If parsing remains ambiguous or failed, the same transaction enqueues one `capture_sort` job keyed by capture ID.
4. The sorter claims the job and receives only the effective capture text, timezone/current time, eligible Area and Project IDs, and a bounded set of reviewed examples.
5. Codex returns one of `task`, `idea`, `note`, `reference`, or `unresolved`, plus optional existing Area/Project IDs, confidence, and a short reason.
6. Home Base validates referenced IDs and stores a `CaptureReviewProposal`. It does not execute entity writes.
7. Accepting, correcting, or dismissing the proposal records immutable routing feedback containing the proposal, final choice, text hash, prompt version, model, and review outcome.

Only accepted or manually corrected outcomes are eligible as future examples. Automatically generated proposals never train the next prompt by themselves. The prompt is versioned source code and cannot be rewritten by the model.

## Assistant Flow

The browser submits only a thread ID and new user text. It cannot submit system or assistant history. Home Base stores the canonical user message and queues one `assistant_turn` job per thread sequence.

The assistant's policy broker initially supports these read operations:

- Search across Home Base
- List and read Areas
- List and read Projects
- List and read Tasks
- List and read Routines
- List and read People
- List and read References, including Books, Movies, and Read Later items
- Read the all-clear/today summary when available

Codex can request several read rounds, up to a fixed limit. Home Base REST credentials stay in the parent worker and are not passed to the Codex child. Tool results are size-limited and labeled untrusted. The final answer is saved as the pending assistant message and delivered through the existing chat response initially; reconnectable event streaming may be added without changing the job contract.

If the assistant is unavailable, the user message remains stored and retryable. Existing Claude chat is available only when explicitly enabled as a fallback; a fallback never resumes a partially executed Codex tool plan.

## Data Model

`AgentJob` stores role, kind, status, idempotency key, payload/result, attempt limits, availability, lease hash/expiry, prompt/model metadata, and timestamps. Status changes are retained; jobs are not deleted.

`ChatThread` owns ordered `ChatMessage` records. A user message and its pending assistant placeholder are created atomically with the job.

`CaptureRoutingFeedback` stores the immutable reviewed routing outcome. It binds examples to the effective text hash and records both the proposed and final classifications.

`WorkerCredential` is not stored in PostgreSQL for this release. Internal routes authenticate high-entropy role-specific bearer values supplied from Railway service variables; only a hash is configured on Home Base. Sorter and assistant credentials are not interchangeable.

## Authentication and Network Design

Workers have no public Railway domains. Home Base calls them only through Railway private networking. Private networking is defense in depth, not authentication: every worker job endpoint also requires its role-specific bearer credential.

The public browser-facing chat endpoint requires the application's user access boundary. Until the direct Railway origin is protected equivalently to Cloudflare Access, the Codex assistant feature remains disabled in production. Worker health endpoints expose only liveness/readiness booleans and never credentials, account identifiers, prompts, captured text, or model output.

Each worker's Codex login is completed separately and stored in its own `/data/codex` volume using file credential storage. A missing, expired, or corrupt session makes readiness fail and stops job claims.

## Failure Handling

- Raw captures remain intact through all failures.
- A model timeout or malformed output returns the job to retry with exponential backoff.
- Expired leases can be reclaimed; stale workers cannot complete reassigned jobs.
- Duplicate completion returns the stored result and cannot create a second proposal/message.
- Assistant turns execute in thread order.
- Maximum attempts move a job to `dead_letter` without discarding its payload or audit state.
- Graceful shutdown stops claims, completes or releases the active lease, and exits inside Railway's grace period.

## Observability

Home Base records queue depth, oldest queued age, dead-letter count, worker readiness, last successful job, prompt version, model, attempt count, and error class. It never logs raw credentials, Codex authentication files, full private prompts, or captured content.

## Testing

Unit and contract tests cover strict schemas, prompt construction, tool allow lists, credential role isolation, prompt-injection fixtures, and secret-free errors. PostgreSQL integration tests cover simultaneous claims, unique job keys, lease expiry/reclaim, stale completion rejection, idempotent duplicate completion, ordered assistant turns, and atomic proposal/message completion.

Runtime tests prove that shell and unified execution are absent, web access is disabled, and Home Base credentials are omitted from the Codex child environment. Deployment smoke tests create one unresolved capture proposal without an entity write and complete one assistant read without mutating Home Base.

## Release Plan

All services build from one clean commit. Only the main Home Base service runs migrations. Deploy Home Base first, then the two private workers with one replica and distinct volumes. Each worker requires a separate Codex device/browser login. Production enablement is gated on worker readiness, a protected direct origin, baseline record counts, and clean smoke tests.

## Deferred Capabilities

- Assistant writes and approval cards
- Undoable automatic filing above a measured confidence threshold
- MCP parity inside the assistant runtime
- Reconnectable token-level streaming
- Multiple replicas per role

These are intentionally deferred until the read-only/proposal-only foundation has production evidence.
