# Read Later Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable, frictionless web-link reading queue that uses References and can be filed globally, to an Area, or to a Project.

**Architecture:** Extend `Reference` with queue status and URL-normalization fields, isolate URL validation/normalization and state transitions in `src/lib/read-later.ts`, and expose the same boundary through Library UI, capture, REST, search/chat, and MCP.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma/PostgreSQL, Vitest, native `URL`, existing Reference UI.

## Global Constraints

- `Reference.kind = "read_later"`; Books and Movies remain separate.
- URL is required; title, metadata, Area, and Project are optional.
- Only HTTP(S) URLs are accepted.
- Metadata failure never blocks saving or loses the URL.
- Opening never silently marks an item read.
- No delete; statuses are unread, read, and archived.

---

### Task 1: Read Later schema and URL boundary

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260714100000_read_later/migration.sql`
- Create: `src/lib/read-later.ts`
- Create: `src/lib/read-later.test.ts`

**Interfaces:**
- Produces: `normalizeReadLaterUrl(raw: string)`, `createReadLater(input, client)`, `setReadLaterStatus(id, status, client)`, and `ReadLaterStatus = "unread" | "read" | "archived"`.

- [ ] **Step 1: Write failing tests**

Cover HTTP(S), rejection of other schemes, lowercase host/default-port normalization, fragment removal, common `utm_*`/`fbclid` removal, stable query ordering, duplicate active queue detection, metadata failure fallback, and read/readAt/archive transitions.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/read-later.test.ts`

- [ ] **Step 3: Add additive fields and indexes**

Add nullable `normalizedUrl`, `readAt`, `savedAt @default(now())`, and `readStatus @default("unread")`; index `(kind, readStatus, savedAt)` and a partial unique PostgreSQL index for active `read_later` normalized URLs when safe. Existing rows retain their kinds and receive harmless defaults.

- [ ] **Step 4: Implement the boundary**

Normalize before lookup/write. `createReadLater` writes the submitted URL plus normalized URL, uses the shared destination resolver, and returns the existing active item on duplicate. Metadata enrichment is a bounded best-effort helper with no credential requirements.

- [ ] **Step 5: Run schema and focused tests**

Run: `npx prisma validate && npx vitest run src/lib/read-later.test.ts`

- [ ] **Step 6: Commit**

```bash
git add prisma src/lib/read-later.ts src/lib/read-later.test.ts
git commit -m "feat: add read later reference model"
```

### Task 2: Library queue and filing UI

**Files:**
- Modify: `src/app/ideas/page.tsx`
- Modify: `src/app/ideas/[database]/page.tsx`
- Modify: `src/app/references/[referenceId]/page.tsx`
- Modify: `src/app/actions.ts`
- Create: `src/components/read-later-form.tsx`
- Create: `src/components/read-later-list.tsx`
- Create: `src/components/read-later.test.tsx`

**Interfaces:**
- Consumes: `createReadLater`, `setReadLaterStatus`, shared `AreaPicker`, hierarchy path options.
- Produces: `/ideas/read-later` queue and compact global `Save link` flow.

- [ ] **Step 1: Add failing component tests**

Assert URL-only save, optional destination, unread-first list, host/date display, Open/Mark read/File controls, no implicit mark-read, and 44px mobile tap targets.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/components/read-later.test.tsx`

- [ ] **Step 3: Build the queue**

Add `Read Later` to Library navigation. Default query shows unread newest-first; explicit filters show read/archived. Use the existing Reference detail route and visually distinguish state without warning colors.

- [ ] **Step 4: Add safe server actions**

Actions validate through `read-later.ts`, return useful form state for malformed URLs/duplicates, revalidate Library/Area/Project/reference routes, and preserve existing items.

- [ ] **Step 5: Verify responsive UI and tests**

Check 390px and desktop layouts, keyboard focus, long URLs, missing titles, empty states, and errors. Run the focused component test.

- [ ] **Step 6: Commit**

```bash
git add src/app/ideas src/app/references src/app/actions.ts src/components/read-later*
git commit -m "feat: add read later library queue"
```

### Task 3: Capture, search, REST, and MCP parity

**Files:**
- Modify: `src/lib/capture/parser.ts`
- Modify: `src/lib/capture/service.ts`
- Modify: `src/app/api/v1/[...path]/route.ts`
- Modify: `src/lib/search.ts` or current search query module discovered with `rg -l 'references' src/lib src/app/search`
- Modify: `src/lib/chat.ts`
- Modify: `mcp/http-server.ts`
- Modify: focused capture/API/MCP tests

**Interfaces:**
- Produces: capture action `save_read_later`, REST list/create/read/file/status contracts, and MCP tools `list_read_later`, `save_read_later`, `file_reference`, `set_read_later_status`.

- [ ] **Step 1: Write failing contract tests**

Cover `read later <url>` intent, generic URL remaining a normal Reference, authenticated REST create/list/status/file, search result links, and MCP input/output schemas.

- [ ] **Step 2: Run and confirm failures**

Run the focused files returned by `rg -l 'reference|capture' src mcp | rg 'test'`.

- [ ] **Step 3: Implement through the shared boundary**

Do not duplicate URL parsing or destination validation in routes/tools. Every write produces the existing audit notification pattern. REST rejects insufficient scopes and MCP only proxies bearer-authenticated REST.

- [ ] **Step 4: Run focused suites**

Expected: all Read Later, capture, REST, search/chat, and MCP tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/capture src/app/api src/lib/chat.ts src/app/search mcp
git commit -m "feat: expose read later across capture and agents"
```

### Task 4: Read Later integrity and full verification

**Files:**
- Modify: `scripts/verify-hierarchy-release.ts`
- Modify: `ARCHITECTURE.md`
- Modify: `README.md`

- [ ] **Step 1: Extend release verification**

Record existing Reference/Book/Movie counts and fail postflight on duplicate active normalized URLs, invalid statuses, or changed retained media counts.

- [ ] **Step 2: Document queue semantics and future clients**

Document Reference kind/status behavior and state that browser/native share extensions are future clients of the REST contract.

- [ ] **Step 3: Run complete verification**

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npx prisma validate
npm run build
git diff --check
```

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-hierarchy-release.ts ARCHITECTURE.md README.md
git commit -m "docs: document read later integrity"
```
