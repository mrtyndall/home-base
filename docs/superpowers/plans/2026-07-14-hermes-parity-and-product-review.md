# Hermes Parity and Product Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Hermes complete, safe Home Base capability coverage and produce an evidence-based roadmap for making the product world class.

**Architecture:** Treat REST as the audited application contract and MCP as a thin typed proxy. Generate a capability matrix from actual routes/tools, fill high-value gaps without adding delete operations, document the verified current host/Tailnet routes, and review every primary product surface at mobile and desktop sizes.

**Tech Stack:** Next.js REST routes, Model Context Protocol TypeScript SDK, Tailscale Serve, LaunchAgents, Vitest, Playwright/browser inspection, Markdown documentation.

## Global Constraints

- No secrets in source, commands, logs, examples, or chat.
- Hermes uses a dedicated API key referenced through the approved secret mechanism.
- No delete tools or routes.
- Every write is scoped, validated, rate-limited, and audited.
- Runtime documentation is based on live checks, not stale host assumptions.
- Product review findings are prioritized; unrelated wholesale redesign is not bundled into this release.
- iPhone 16 Pro Max at 440×956 CSS pixels is the primary mobile UI/UX and release-QA target; smaller mobile widths remain regression checks.

---

### Task 1: Agent capability inventory and contract tests

**Files:**
- Create: `docs/hermes-home-base-integration.md`
- Create: `docs/home-base-capability-matrix.md`
- Create: `mcp/http-server.contract.test.ts`
- Modify: `mcp/http-server.ts`

**Interfaces:**
- Produces: a route-to-tool matrix with capability, REST method/path, scope, MCP tool, audit event, and smoke-test status.

- [ ] **Step 1: Inventory actual routes and tools**

Enumerate `/api/v1` branches and `server.registerTool` calls. Include Today, search, calendar, Tasks, Areas, Projects, Ideas, References/Read Later, notes/docs, milestones, check-ins, journal, resurfacing, reviews, routines, and People.

- [ ] **Step 2: Write failing matrix/contract tests**

The test asserts unique tool names, descriptions without Domain-era claims, expected capability-group tools, scope-safe proxy calls, structured error responses, and no tool name containing `delete`.

- [ ] **Step 3: Run and confirm failures**

Run: `npx vitest run mcp/http-server.contract.test.ts`

- [ ] **Step 4: Fill critical parity gaps**

Add only missing tools backed by REST routes. Where REST is missing, add a route using existing shared application helpers before adding its MCP proxy. Keep tool schemas explicit and descriptions action-oriented.

- [ ] **Step 5: Run contract tests**

Expected: capability matrix and MCP contract tests PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/home-base-capability-matrix.md mcp src/app/api mcp/http-server.contract.test.ts
git commit -m "feat: complete home base agent parity"
```

### Task 2: Current-host Hermes setup and smoke tests

**Files:**
- Modify: `docs/hermes-home-base-integration.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Create: `scripts/verify-agent-integration.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run verify:agent-integration`, a secret-free Hermes MCP config example, and live runtime troubleshooting steps.

- [ ] **Step 1: Record verified endpoints without credentials**

Use `launchctl print`, local health checks, `tailscale ip -4`, and `tailscale serve status`. Record the repository path, SSH Git remote, local app/MCP endpoints, Tailnet route, and Railway browser URL. Explain any mismatch between reported and actual host identity.

- [ ] **Step 2: Add the integration verifier**

The script reads `HOME_BASE_API_URL`, `HOME_BASE_MCP_URL`, and bearer token from environment references. It checks health, tool discovery, one read from each capability group, and a reversible/non-destructive write smoke path using a clearly prefixed capture/task that is completed rather than deleted.

- [ ] **Step 3: Document safe credential setup**

Show placeholders and environment variable names only. Registration uses the repository's API-key script and approved 1Password-backed runtime path; never print the generated key in logs or docs.

- [ ] **Step 4: Run read-only smoke tests**

Run local MCP health and discovery without exposing tokens. Run write smoke tests only when a dedicated key is already available through environment references.

- [ ] **Step 5: Commit**

```bash
git add docs/hermes-home-base-integration.md README.md ARCHITECTURE.md scripts/verify-agent-integration.ts package.json
git commit -m "docs: add hermes integration runbook"
```

### Task 3: Full feature and UI/UX review

**Files:**
- Create: `docs/reviews/2026-07-14-world-class-product-review.md`
- Create: `docs/reviews/2026-07-14-feature-inventory.md`

**Interfaces:**
- Produces: evidence-backed inventory and ranked P0/P1/P2/P3 roadmap.

- [ ] **Step 1: Build the route and feature inventory**

Map every primary route, its purpose, main action, empty/loading/error state, data source, and agent equivalent. Flag dead, duplicate, hidden, or terminology-inconsistent capabilities.

- [ ] **Step 2: Review mobile and desktop surfaces**

At minimum inspect Home, Today, Inbox, Tasks/list/detail/create, Areas/index/detail/create, Projects/detail/create, Library and each database, Reference detail, People, Search, Chat, Calendar event, Settings, and Notifications at iPhone 16 Pro Max (440×956 CSS pixels), a smaller-phone regression width (390×844), and desktop (1440×1000). Verify Safari safe-area behavior, bottom capture/navigation clearance, 44px touch targets, long path/title wrapping, thumb reach, and zero horizontal overflow.

- [ ] **Step 3: Review cross-cutting quality**

Assess navigation, information architecture, capture-to-file flow, typography, spacing, touch targets, keyboard/focus, landmarks/labels, contrast, overflow, loading/empty/error states, perceived performance, API/auth exposure, operational reliability, and data trust.

- [ ] **Step 4: Rank findings**

Use:

- `P0`: correctness, data loss, auth/security, inaccessible core action;
- `P1`: repeated workflow friction or confusing information architecture;
- `P2`: polish, consistency, accessibility improvements that do not block core work;
- `P3`: expansion and experiments.

Each item includes evidence, impact, recommendation, and acceptance test. Separate quick wins from architectural work.

- [ ] **Step 5: Implement only release-blocking findings**

Fix P0 issues and P1 issues directly caused by nested Areas, unfiled Projects, Read Later, or Hermes. Add a regression test for every code fix. Leave unrelated recommendations in the roadmap.

- [ ] **Step 6: Commit**

```bash
git add docs/reviews src
git commit -m "docs: review home base product experience"
```

### Task 4: Final independent review and release gates

**Files:**
- Modify: only files needed to resolve verified review findings.

- [ ] **Step 1: Run a whole-branch code review**

Review migration safety, Area cycle handling, Project-child consistency, URL security/deduplication, bearer scopes, audit coverage, MCP parity, accessibility, and responsive UI.

- [ ] **Step 2: Fix findings with regression tests**

Do not accept speculative refactors. Every fix names the failing invariant and demonstrates it with a focused test.

- [ ] **Step 3: Run final verification**

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npx prisma validate
npm run build
git diff --check
git status --short --branch
```

Expected: all commands pass and the worktree is clean after commits.

- [ ] **Step 4: Release**

Run hierarchy preflight, deploy the exact reviewed commit through Railway, wait for terminal `SUCCESS`, run strict postflight and live browser/API/MCP checks, restart both local LaunchAgents, push `main`, and update the Home Base work log with outcomes, decisions, verification, next steps, and blockers.
