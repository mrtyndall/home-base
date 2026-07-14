# Home Base world-class product and UI/UX review

**Date:** 2026-07-14

**Primary viewport:** iPhone 16 Pro Max, 440×956 CSS pixels

**Regression viewports:** 390×844 and 1440×1000

**Scope:** current branch product, information architecture, workflows, responsive UI, accessibility, performance, security, reliability, and agent integration

## Executive verdict

Home Base has crossed from prototype into a credible personal operating system. The product model is now coherent: one nested Area hierarchy, Projects that can begin unfiled, a durable Inbox, global media/People, References with Read Later, and non-destructive human/agent mutations. The visual language is calm and specific, and the new Task Quick Edit demonstrates the right interaction standard: direct facts, lazy data, optimistic feedback, serialized writes, Undo, Retry, and safe mobile presentation.

It is not ready for unrestricted real-data production use until the access P0 is closed. The attachment P0 identified during review has been fixed on this branch. It is also one focused workflow pass away from feeling consistently excellent: Search still creates dead ends, Inbox omits unfiled Projects and is difficult to reach, and legacy drag/capture interactions do not match the recovery and accessibility quality of Task Quick Edit.

The recommendation is not a wholesale redesign. Keep the quiet stone/teal, Newsreader/Geist identity and the capture-first model. Make the new Task Quick Edit behavior the interaction contract for every frequent move/date/status action, then close navigation and security gaps.

## Method and confidence

This review reconciles the approved designs/plans, early feature and UX audits, current source, schema, migration/release verifiers, route inventory, tests, MCP capability matrix, and Hermes runbook. Early audit findings were rechecked against the later branch so resolved work is labelled **fixed**, not repeated as backlog.

This is an evidence-backed source/contract review, not a claim of completed pixel QA. The final release still requires interactive browser checks at all three target viewports, including iOS Safari keyboard appearance, safe-area values, horizontal overflow, scroll containment, focus order/restoration, and simulated network failures.

Priority meanings:

- **P0:** security, data loss/corruption, correctness, or an inaccessible release boundary.
- **P1:** repeated workflow friction, broken navigation, or a trust failure in a core action.
- **P2:** meaningful polish, consistency, accessibility, or scalability work.
- **P3:** expansion and experiments after the core is excellent.

## What is already excellent on this branch

### Fixed — the taxonomy now matches how people think

Nested Areas replace the ambiguous Domain/Area split. Paths make duplicate leaf names understandable. Projects are finishable outcomes and no longer require premature filing. The shared hierarchy boundary prevents cycles and keeps Project-linked child filing consistent atomically.

### Fixed — empty Today no longer means empty Home

Home now shows an Upcoming card and next-commitment line. Today includes Tomorrow and explicit empty copy. This directly addresses the earlier “nothing today” dead end.

### Fixed — task assignment and dates have a modern reference interaction

`TaskQuickEdit` is the strongest workflow in the app:

- Location and Schedule are visible facts, including unset values.
- Opening Move is the point at which destinations load.
- Area/Project paths retain context; unfiled Projects work.
- Date presets reduce typing while native date input remains available.
- The interface responds immediately and closes before the server round trip.
- Schedule and location serialize independently, so one does not block the other.
- Operation sequencing prevents stale responses from winning.
- Exact Undo lasts six seconds; failure rolls back and exposes Retry.
- Mobile uses a dock-aware sheet; desktop uses a bounded dialog.
- Focus is wrapped and restored, Escape works, long labels wrap, and controls meet 44px.

This should become a small internal interaction system, not remain a one-off Task component.

### Fixed — Read Later is one durable Reference workflow

The URL is saved before enrichment, metadata fetching is bounded and SSRF hardened, duplicates are constrained at the database layer, opening does not imply reading, and filing remains optional. This is the right trust model for a reading queue.

### Fixed — Hermes has a complete non-destructive contract

The active MCP registry contains 74 typed tools, mirrors authenticated REST, rejects route-confusable IDs, redacts boundary errors, and exposes no Domain/delete tools. Live authentication is a deployment/setup gap, not a missing application contract.

## Target experience principles

1. **Capture is one breath.** Text or URL first; type, date, Area, and Project are optional refinements.
2. **Organize in place.** Location/date/status facts are buttons, not buried edit forms.
3. **The interface believes the tap.** Frequent reversible mutations update optimistically.
4. **Every optimistic action has a truth path.** Serialize per entity/property, ignore stale responses, rollback on failure, and show Retry; destructive-looking status moves also offer Undo.
5. **Load detail at intent.** Lists ship labels/counts. Full destination trees, metadata, history, and secondary forms load when opened.
6. **Search always leads somewhere.** A result is a navigation action, never a static receipt.
7. **Mobile chrome is a physical constraint.** Content, sheets, keyboard, toast, capture, nav, and safe-area insets share one clearance model.
8. **Accessibility is interaction parity.** Anything available by drag or custom picker is also available by keyboard and assistive technology.

## Priority roadmap

### P0-1 — Put real personal data behind an enforceable access boundary

**State:** remaining release blocker; the open origin was an explicit rollout decision, but the user is now beginning real use.

**Evidence:** README states that the direct Railway origin is intentionally open until Cloudflare Zero Trust. Browser pages, Server Actions, `/api/capture`, task/project browser mutations, chat, settings, journal export, and document routes do not share the `/api/v1` bearer boundary.

**Risk:** anyone who reaches the direct origin can read or mutate personal data. Adding Cloudflare in front is insufficient if the Railway URL remains reachable around it.

**Required outcome:** enable Cloudflare Access for the canonical hostname; block or remove public access to the Railway origin; verify direct-origin denial and authenticated canonical-host access. Keep authenticated REST/MCP on their dedicated bearer boundary.

**Acceptance:** anonymous canonical access is challenged; direct Railway access cannot bypass Access; OAuth/callback, cron, local/Tailnet, and MCP paths have explicitly tested policies; settings/export/mutations are not anonymously usable.

### P0-2 — Bound and validate attachments before real use

**State:** fixed on branch after the reviewed checkpoint.

**Evidence:** `src/app/api/documents/presign/route.ts` accepts any positive declared size and client MIME; local upload reads the complete body with `request.arrayBuffer()` and never compares bytes to the declared size; download is unauthenticated. A caller can create orphan document rows and consume memory/storage.

**Implemented outcome:** a centralized 25 MiB limit and safe MIME allowlist now apply at client and server boundaries. R2 signing binds MIME and content length. Local upload requires matching length/type, streams with an actual byte cap into a private temporary file, removes failed/partial state, and atomically publishes only a verified file. The external browser access boundary remains covered by P0-1.

**Acceptance:** over-limit, mismatched, disallowed, interrupted, and unauthenticated uploads fail without a durable active attachment or unbounded memory use; valid upload/download works through Access and R2/local modes.

### P1-1 — Complete the unified Inbox contract, including unfiled Projects

**State:** remaining; branch-defining workflow is incomplete.

**Evidence:** `GlobalInbox` counts Tasks, Ideas, References, Notes, Docs, and Files but not Projects; `loadGlobalInbox()` does not query unfiled Projects. `/areas/inbox` is reachable mainly from conditional Home attention, while the Areas index has no stable Inbox row.

**Impact:** a Project can now be created without an Area but can disappear into “recent Projects” rather than the promised sorting surface. Capture-first organization loses its reliable queue.

**Recommendation:** make `/inbox` canonical (redirect `/areas/inbox` for compatibility), add a persistent Inbox entry/count in the Areas surface or nav-adjacent location, include unfiled Projects, and use one destination picker for Inbox/Area/Project filing.

**Acceptance:** with no pending capture alerts, one unfiled Project and one of each unfiled content type remain reachable from primary navigation in one action; Project filing updates immediately and is reversible.

### P1-2 — Turn Search into navigation, not a report

**State:** remaining.

**Evidence:** `runSearch()` searches twelve entity types, but only References and highlights are assigned `href`. Tasks, Projects, Captures, Notes, check-ins, People, and Person facts render as static `<article>` rows. The first 40 concatenated results are ordered by type, not relevance.

**Impact:** Search can prove an item exists but cannot open it. Early categories can crowd out stronger matches, undermining retrieval trust.

**Recommendation:** define one destination contract for every result kind; add exact-title/prefix ranking ahead of body matches; retain per-type caps but merge by score/recency; group only when grouping helps scanning; preserve query and scroll on back navigation.

**Acceptance:** every result is a keyboard-focusable deep link or lands on a clearly anchored parent; an exact Task/Project/Person title is not displaced by incidental capture text; empty and failed searches are distinct.

### Fixed — Today shows only actionable captures

Today still has a narrowly scoped review surface, but `selectActionableCaptures()` removes successful captures that already became Tasks or other durable entities. Only ambiguous, failed, or unresolved outcomes remain. This satisfies the user's request to remove redundant capture receipts while preserving the work that still needs intervention.

### P1-4 — Give drag/reorder the same recovery guarantees as Quick Edit

**State:** remaining core trust/accessibility gap.

**Evidence:** `DraggableTaskLink` mutates the DOM before persistence, then only clears `dragPending` in `finally`. A failed request has no rollback, Retry, or visible error. The “Drag task” handle is a non-focusable `<span>`; pointer events are the only reorder input.

**Impact:** the UI can display an order/date the server rejected until refresh. Keyboard and switch users cannot perform the same action.

**Recommendation:** route drag through the same mutation-channel pattern as Quick Edit: snapshot previous position/date, optimistic move, per-task serialization, stale protection, rollback with Retry, and Undo. Make the handle a button with keyboard move-before/move-after/move-to-section commands and a polite live announcement.

**Acceptance:** simulated failure returns the card to its exact prior place and announces Retry; rapid moves persist last intent; keyboard-only reorder/date-section movement is equivalent; focus stays with the moved task.

### P1-5 — Replace the capture pickers' incomplete listbox behavior

**State:** remaining accessibility and mobile robustness gap.

**Evidence:** `CapturePicker` claims `aria-haspopup="listbox"`, `role="listbox"`, and `role="option"`, but focus stays on the trigger and there is no Arrow/Home/End/typeahead/active-descendant model. Options are buttons re-roled as options. The absolute `min-w-[18rem]` menu is not viewport/keyboard aware. Capture result text is not a scoped live region.

**Recommendation:** use an accessible combobox/dialog picker or native select until the full ARIA model is justified. Reuse path search, recents, and lazy loading from Task Quick Edit. Put success/failure in an `aria-live` region and provide Retry for delivery failure without clearing text.

**Acceptance:** VoiceOver and keyboard can open, navigate, select, escape, and return focus; the picker remains visible above the iOS keyboard/dock at 440×956 and 390×844; long paths wrap; capture text survives failures and Retry is explicit.

### P1-6 — Prove the mobile clearance model in real iOS rendering

**State:** release verification gap; implementation is promising but incomplete.

**Evidence:** the dock and Task Quick Edit share `--app-dock-clearance`, but `viewport` does not declare `viewportFit: "cover"`; the shell uses fixed `pb-44` rather than the same token; expanded capture height is dynamic while the clearance represents the collapsed dock.

**Risk:** Safari safe-area values, the software keyboard, expanded capture controls, sheets, and Undo/Retry toasts may overlap or leave excessive dead space despite source-level contracts.

**Recommendation:** use one composable set of CSS tokens for safe inset, collapsed dock, expanded overlay, content end padding, sheets, and toast stack; add `viewport-fit=cover` if verified appropriate; measure with actual Safari/PWA behavior rather than device emulation alone.

**Acceptance:** at both mobile sizes, last content can scroll above the dock, the expanded capture bar and task sheet never overlap, keyboard-open controls remain reachable, toast buttons clear all chrome, and there is zero horizontal overflow.

### P1-7 — Finish authenticated Hermes activation and smoke evidence

**State:** external/setup blocker, not an app-contract gap.

**Evidence:** the repository has a complete 74-tool manifest and verified local/Tailnet routes, but the host review found no Hermes executable/configuration or approved dedicated Home Base credential. Authenticated discovery/read/write smoke therefore has not run.

**Recommendation:** install/locate the actual Hermes client, reconcile its MCP configuration schema, provision a dedicated `read,write,capture` key through 1Password-backed runtime references, run read-only verification first, then the deterministic persistence-only write smoke and cleanup.

**Acceptance:** Hermes discovers the exact registry, performs representative reads, safely creates/preserves a smoke capture, creates/completes all matching smoke tasks, and leaves no open smoke task; no credential appears in a file, command output, log, or chat.

### P2-1 — Extend optimistic mutation UX beyond Tasks

**State:** remaining consistency work.

Read Later status/filing serializes writes but waits for completion and has no optimistic state, Undo, or action-level Retry. Project/Area filing and many lifecycle actions submit and refresh. Create a small shared mutation framework with:

- property-scoped channels;
- immediate local value;
- authoritative reconciliation;
- idempotency for retryable writes;
- exact rollback and Retry;
- six-second Undo for reversible state/file moves;
- one toast placement aware of the dock.

Adopt it first for Read Later status/filing, Project Area, Area parent, task completion/star, and Inbox filing. Do not make irreversible external actions optimistic.

### P2-2 — Lazy-load high-cardinality choices and paginate long collections

**State:** remaining scalability work.

Task Quick Edit already loads destinations at intent. Apply that contract to Read Later filing, capture options, Project/Area filing, large People/Reference databases, and activity/history. The Areas page currently loads up to 80 Projects with up to 60 Tasks each plus aggregate queries, while the entire Area tree renders open. Use small initial facts, collapsed branches, cursor pagination, and search-on-open.

Acceptance should include unchanged first interaction at small data, bounded payload/query counts at 10× data, and no loss of keyboard accessibility.

### P2-3 — Establish a 44px/focus/semantics design-system floor

**State:** partially fixed in new components, inconsistent elsewhere.

Examples include 36px Search/Chat/Settings header controls, 30px Inbox actions, 32px Project add-task, 36–40px legacy forms/actions, and many hover-only focus treatments. Nav tabs omit `aria-current`; `/areas/*` does not activate the Areas tab; Settings relies on `title` rather than an explicit accessible name; there is no skip link.

Create shared primitives/tokens for coarse-pointer hit areas, focus-visible ring/offset, icon-button names, current-route semantics, status/live regions, and reduced motion. Compact visuals may remain while the interactive rectangle reaches 44×44.

### P2-4 — Make Area hierarchy useful at scale

**State:** branch feature works; progressive-disclosure polish remains.

The tree is rendered recursively with all `<details open>`. Visual indentation caps, but every descendant and every Area card loads immediately. Add remembered disclosure state, counts that clarify direct versus subtree content, and a fast path-filter/search. Keep full paths in pickers and breadcrumbs. Do not reintroduce Domains.

### P2-5 — Clarify route and noun ownership

**State:** remaining IA debt.

The product calls `/projects` “Areas” and `/ideas` “Library”; Inbox is `/areas/inbox`. These are implementation-era names that leak into bookmarks, analytics, active-tab logic, and agent/human documentation. Introduce canonical `/areas`, `/library`, and `/inbox` routes with redirects, then model tab ownership explicitly for `/areas/**` and `/projects/**`.

### P2-6 — Upgrade loading, empty, and error recovery by surface

**State:** mixed.

Global loading and `SetupNotice` avoid crashes, and new Area/Read Later empty states are helpful. Several panels still say only “None yet,” server actions can silently return, and route-level generic database failure does not preserve local intent. Add route-specific skeletons, action-state errors, retained values, and Retry. Empty states should name the next useful action, not merely report absence.

### P2-7 — Make calendar and secondary results consistently navigable

**State:** remaining polish.

Today calendar rows are static despite an event detail route. Inbox Notes are static despite note detail. Docs route through Search. Ideas lack a precise detail destination. Every row that looks like an entity should open that entity or an anchored parent, with a full-row 44px target and visible focus.

### P2-8 — Add observability for trust-sensitive workflows

**State:** operational improvement.

Track capture-to-created latency/failure, task quick-edit rollback/retry/undo, Read Later enrichment outcome, calendar freshness, attachment rejection, MCP tool failures, and migration verifier results. Store structured event names without content or secrets. A small Settings diagnostics surface should answer “is my data safe and are integrations current?”

### P3 — Expansion after the core workflow pass

1. Native iOS share extension or PWA share target for URL/text capture using authenticated REST.
2. Browser extension for one-tap Read Later with optional Area/Project filing.
3. Offline capture outbox with stable idempotency keys and visible delivery state.
4. Human notification/audit center with filters and deep links.
5. Read Later reading-time/domain filters and optional reader extraction, never gating URL persistence.
6. Saved searches/smart views and a command palette after every result has a destination.
7. Bulk task filing/scheduling for deliberate review sessions, while preserving single-item speed.
8. Area review rituals and subtree health summaries, without turning Home into a dashboard wall.

## Frictionless task/date/move interaction blueprint

Use one interaction grammar everywhere:

```text
Tap fact or quick-edit
        │
        ├── Schedule → immediate presets → optimistic close
        │                              ├── success → refresh + Undo
        │                              └── failure → rollback + Retry
        │
        └── Move → recent destinations immediately
                   └── load/search full hierarchy only on intent
                                      ├── success → refresh + Undo
                                      └── failure → rollback + Retry
```

Implementation rules:

- Scope serialization to `entity + property`, not the whole page.
- Give every operation a monotonic token; only the newest response may reconcile.
- Send the exact prior server representation with Undo.
- Use stable idempotency keys when a network timeout could hide a committed write.
- Optimistic UI must be reversible. If reversal is impossible or externally consequential, show pending truth instead.
- Refresh is reconciliation, not feedback; the user should already see the intended result.
- Search/full hierarchy data loads only when Move opens; cached options may be reused briefly and invalid IDs dropped.
- Recents are an accelerator, never the only route to a destination.
- Native date input remains the fallback after ergonomic presets.
- Drag is an enhancement, not the sole mechanism.

## Viewport-specific review checklist

### 440×956 — primary iPhone 16 Pro Max

- Header utilities fit without truncating logo or shrinking below 44px.
- Long titles and `Area / Child / Project` paths wrap without pushing actions offscreen.
- Content's final row scrolls fully above capture/nav chrome.
- Capture expanded state, picker, iOS keyboard, Task Quick Edit sheet, and toast never overlap.
- Sheet choices remain reachable with Dynamic Type-equivalent wrapping.
- No horizontal scroll from `min-width`, date inputs, grids, menus, or unbroken URLs.
- Primary task/date/location actions are reachable without entering full Edit.

### 390×844 — smaller-mobile regression

- Header may collapse utility labels before shrinking hit targets.
- Area tree indentation preserves at least a useful card/text width.
- Two-column action/header layouts stack rather than compress.
- Bottom sheets retain a usable scroll viewport above the dock.
- All menus use viewport-bounded width and placement.

### 1440×1000 — desktop regression

- Content remains within the intentional max width; reading lines do not become too long.
- Mobile sheets become centered/anchored dialogs with focus containment.
- Hover adds information but is never required.
- Keyboard traversal order follows visual order.
- Multi-column Today/Project layouts do not hide empty/error states.

## Release sequence

1. Close P0 access/origin and attachment boundaries.
2. Remove Today capture duplication and add unfiled Projects/persistent entry to Inbox.
3. Fix Search destinations/ranking.
4. Bring drag and capture pickers to the Task Quick Edit recovery/accessibility standard.
5. Run full interactive QA at all target viewports and fix verified P1 release findings.
6. Complete Hermes authenticated activation and deterministic smoke evidence.
7. Run full automated quality gates, migration preflight/postflight, Railway deployment checks, local LaunchAgent/Tailnet health, and direct-origin denial.
8. Schedule P2 consistency/scalability work as the next product increment rather than delaying every P0/P1 correction for a broad redesign.

## Definition of “world class” for this app

Home Base is world class when a thought, task, or URL can be captured in seconds; filing is optional and later reassignment is immediate; Search always opens the thing found; every high-frequency mutation responds instantly yet recovers truthfully; the hierarchy stays understandable as it grows; iPhone chrome never covers work; keyboard and assistive users can perform every core action; the agent has the same safe non-destructive capabilities; and personal data cannot be reached around the intended access boundary.
