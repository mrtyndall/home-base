# Codex Home Base Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a proposal-only Codex capture sorter and a read-only Codex Home Base assistant as isolated Railway workers with durable jobs and reviewed-example learning.

**Architecture:** Home Base owns a PostgreSQL job queue, canonical chat history, routing feedback, and all policy decisions. One shared worker image is deployed twice; Codex has built-in shell/network tools disabled and returns strict JSON to a parent controller that holds role-specific service credentials.

**Tech Stack:** Next.js 16.2.10 route handlers, Prisma 7/PostgreSQL, Node.js 22, Zod 4, `@openai/codex-sdk` 0.144.4, Railway private networking and volumes.

## Global Constraints

- Sorter results are proposals only and never create or edit entities.
- Assistant is read-only; no write tool or generic MCP credential is available.
- Raw captures are persisted before remote parsing.
- Only explicit accepted/corrected reviews become learning examples.
- Codex child processes have shell, unified exec, apps, plugins, multi-agent, hooks, memories, goals, web search, and network disabled.
- Sorter and assistant run one replica each with separate persistent `CODEX_HOME` volumes and separate ChatGPT logins.
- Workers have no public Railway domains and never receive `DATABASE_URL`.
- Existing Claude parsing/chat remain feature-flagged fallbacks.

---

### Task 1: Define and verify worker contracts

**Files:**
- Create: `src/lib/agent/schemas.ts`
- Create: `scripts/codex-worker-contracts.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `sorterResultSchema`, `assistantStepSchema`, `agentJobClaimSchema`, and bounded prompt-input schemas used by the app and worker.

- [ ] **Step 1: Write the failing contract test** covering accepted sorter targets, invalid IDs/unknown fields, assistant read-tool allow-listing, bounded messages, and prompt-injection text remaining plain data.
- [ ] **Step 2: Run `npx tsx --test scripts/codex-worker-contracts.test.ts`** and verify it fails because `src/lib/agent/schemas.ts` does not exist.
- [ ] **Step 3: Implement strict Zod schemas** with `.strict()`, explicit size caps, UUID IDs, confidence bounds, and no write tool names.
- [ ] **Step 4: Re-run the focused test** and verify it passes.

### Task 2: Add the durable queue, chat, and feedback records

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260714150000_codex_workers/migration.sql`
- Create: `src/lib/agent/queue.ts`
- Create: `src/lib/agent/auth.ts`
- Create: `scripts/agent-queue-contracts.test.ts`

**Interfaces:**
- Produces `enqueueAgentJob`, `claimAgentJob`, `heartbeatAgentJob`, `completeAgentJob`, `failAgentJob`, and `authenticateWorkerRequest`.

- [ ] **Step 1: Write failing schema/SQL/auth tests** for unique idempotency keys, role separation, lease hashes, stale completion rejection, retry/dead-letter fields, ordered chat records, and immutable routing feedback.
- [ ] **Step 2: Run the focused test** and confirm the new models/functions are absent.
- [ ] **Step 3: Add additive Prisma models/enums and migration SQL** including indexes, foreign keys, no-delete triggers, and `FOR UPDATE SKIP LOCKED` claim support.
- [ ] **Step 4: Implement queue/auth functions** using random lease tokens, SHA-256 hashes, constant-time role credential checks, exponential backoff, and idempotent completion.
- [ ] **Step 5: Generate Prisma and run the focused test** until it passes.

### Task 3: Connect unresolved captures to the sorter safely

**Files:**
- Modify: `src/lib/capture/service.ts`
- Modify: `src/lib/capture/review-proposals.ts`
- Modify: `src/app/actions.ts`
- Create: `src/lib/agent/sorter.ts`
- Modify: `src/app/api/cron/capture-review-proposals/route.ts`
- Create: `scripts/codex-sorter-integration.test.ts`

**Interfaces:**
- Produces `enqueueUnresolvedCaptureJobs`, `buildSorterJobInput`, `applySorterProposal`, and `recordCaptureRoutingFeedback`.

- [ ] **Step 1: Write failing tests** proving raw capture persistence precedes parsing, unresolved captures enqueue transactionally, one capture has one active job, invalid Area/Project IDs are removed, and completion creates only one review proposal.
- [ ] **Step 2: Run the focused test** and confirm the new behavior is absent.
- [ ] **Step 3: Persist capture rows before model parsing** while preserving current idempotency behavior.
- [ ] **Step 4: Enqueue unresolved sorter jobs in the capture transaction** and make the cron route backfill missing jobs.
- [ ] **Step 5: Implement bounded sorter context and proposal application** under the capture advisory lock.
- [ ] **Step 6: Record reviewed outcomes** from manual conversion/accept/dismiss paths without allowing generated proposals to become examples.
- [ ] **Step 7: Re-run focused and existing capture tests** until they pass.

### Task 4: Add canonical queued chat

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Create: `src/app/api/chat/turns/[turnId]/route.ts`
- Create: `src/lib/agent/chat.ts`
- Modify: `src/components/chat-surface.tsx`
- Create: `scripts/codex-chat-contracts.test.ts`

**Interfaces:**
- POST `/api/chat` accepts only `{threadId?, question}` and returns `{threadId, turnId, status}` when Codex chat is enabled.
- GET `/api/chat/turns/:turnId` returns pending, completed with answer, or retryable failure.

- [ ] **Step 1: Write failing tests** proving browser history is rejected, server history is canonical, one pending turn per thread sequence is queued, and polling cannot read another thread by a forged history.
- [ ] **Step 2: Run the focused test** and confirm current client-supplied history violates the contract.
- [ ] **Step 3: Implement transactional thread/message/job creation** with bounded canonical history and feature-flagged Claude fallback.
- [ ] **Step 4: Implement turn polling** with safe error classes and no prompt/tool payload leakage.
- [ ] **Step 5: Update the client** for optimistic user messages, polling with capped backoff, retryable errors, and no duplicate assistant append.
- [ ] **Step 6: Re-run focused and chat structural tests** until they pass.

### Task 5: Build the shared locked-down worker image

**Files:**
- Create: `worker/package.json`
- Create: `worker/package-lock.json`
- Create: `worker/tsconfig.json`
- Create: `worker/Dockerfile`
- Create: `worker/src/config.ts`
- Create: `worker/src/codex.ts`
- Create: `worker/src/queue-client.ts`
- Create: `worker/src/sorter.ts`
- Create: `worker/src/assistant.ts`
- Create: `worker/src/home-base-tools.ts`
- Create: `worker/src/index.ts`
- Create: `worker/prompts/sorter.md`
- Create: `worker/prompts/assistant.md`
- Create: `scripts/codex-worker-runtime.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- The worker polls internal Home Base job routes and listens on `PORT` for `/healthz` and `/readyz`.
- `runSorter(input)` returns `sorterResultSchema`.
- `runAssistant(input, executeReadTool)` returns a final answer after at most six validated read-tool rounds.

- [ ] **Step 1: Write failing runtime tests** for role config, secret-free child environment, disabled Codex built-ins, output-schema validation, tool allow-listing, timeouts, and graceful shutdown.
- [ ] **Step 2: Run the focused test** and confirm worker modules are absent.
- [ ] **Step 3: Create the pinned worker package and Debian multi-stage image** with a non-root runtime user, empty work directory, and persistent `/data/codex` home.
- [ ] **Step 4: Implement Codex factory** with all built-ins disabled and the minimal environment allow list.
- [ ] **Step 5: Implement sorter and assistant controllers** using fresh/resumable threads, strict output schemas, untrusted tool-result labels, and bounded rounds.
- [ ] **Step 6: Implement the serialized polling loop and health server** so a role claims one job at a time and does not claim when Codex auth is unavailable.
- [ ] **Step 7: Build the worker image and run runtime tests** until both pass.

### Task 6: Add internal job routes and release verification

**Files:**
- Create: `src/app/api/internal/agent/jobs/claim/route.ts`
- Create: `src/app/api/internal/agent/jobs/[jobId]/heartbeat/route.ts`
- Create: `src/app/api/internal/agent/jobs/[jobId]/complete/route.ts`
- Create: `src/app/api/internal/agent/jobs/[jobId]/fail/route.ts`
- Create: `src/app/api/internal/agent/health/route.ts`
- Create: `scripts/codex-worker-api.test.ts`
- Create: `docs/codex-workers-railway.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Internal routes authenticate a role credential and expose only that role's jobs.
- Completion atomically stores the job result and sorter proposal or assistant message.

- [ ] **Step 1: Write failing route tests** for missing/invalid/wrong-role auth, lease ownership, duplicate completion, and redacted errors.
- [ ] **Step 2: Run the focused test** and confirm routes are absent.
- [ ] **Step 3: Implement thin route handlers** delegating all validation and transaction logic to the agent library.
- [ ] **Step 4: Document Railway services, variables, private URLs, volumes, separate Codex logins, rotation, readiness, rollback, and smoke tests** without including credential values.
- [ ] **Step 5: Run unit tests, Prisma validation/generation, lint, production build, worker build, and database integration tests** with fresh output.
- [ ] **Step 6: Commit and push the clean release commit.**
- [ ] **Step 7: Back up production and deploy the main app from the exact commit.**
- [ ] **Step 8: Create/deploy `home-base-sorter` and `home-base-assistant` as private one-replica Railway services with separate volumes.**
- [ ] **Step 9: Complete separate Codex login flows, then verify terminal Railway `SUCCESS`, exact release fingerprints, worker readiness, proposal-only sorter smoke, read-only assistant smoke, baseline counts, and external app health.**
