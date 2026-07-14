# Read Later Task 2 Report

## Status

Implemented and committed the Library Read Later queue and filing UI.

## Delivered

- Added `Read Later` to the Library database overview.
- Added `/ideas/read-later` with unread-by-default, newest-first loading and explicit unread, read, and archived filters.
- Added a URL-first `Save link` form with optional Area or Project filing, hierarchy path labels, actionable success/error state, and delayed metadata enrichment through Next.js `after()`.
- Added queue rows with fallback host titles, host/saved-date metadata, excerpts, full Area/Project paths, long-link wrapping, and calm state styling.
- Added 44px `Open`, `Mark read`/`Mark unread`, `Archive`, and `File` controls. `Open` is a plain external anchor and never changes read state.
- Added shared-boundary server actions for save, status, and filing, including route revalidation for Library, Reference, Area, and Project consumers.
- Preserved an existing duplicate item's filing when a URL is resubmitted without an explicit destination.
- Added Read Later status/open/fallback filing context to Reference detail.
- Added durable component/contract coverage to the repository's `scripts/*.test.ts` harness.

## Verification

- `npx tsx --test scripts/read-later-ui.test.ts` — PASS, 6/6.
- `npm test` — PASS, 157/157.
- `npx tsc --noEmit --incremental false` — PASS, exit 0.
- `npx eslint src/app/actions.ts 'src/app/ideas/[database]/page.tsx' src/app/ideas/page.tsx 'src/app/references/[referenceId]/page.tsx' src/components/read-later-form.tsx src/components/read-later-form-client.tsx src/components/read-later-list.tsx scripts/read-later-ui.test.ts` — PASS, exit 0.
- `npm run build` — PASS; Next.js production compilation, TypeScript phase, page generation, and standalone asset copy completed.
- `git diff --check` — PASS.
- Local `GET /ideas/read-later` — HTTP 200 after resolving the server/client AreaPicker boundary; the worktree has no `DATABASE_URL`, so the route rendered the expected setup notice rather than live queue data.

## Design review

The implementation keeps Home Base's Newsreader/Geist typography, soft stone/teal palette, rounded paper surfaces, quiet status treatment, and existing Library spacing. The signature is a reading-slip row: serif title, restrained queue stamp, provenance line, and compact action rail. All new interactive controls have a 44px minimum target, focus-visible treatment, and long unbroken title/path content uses `overflow-wrap:anywhere`.

## Concerns / follow-up

- Live visual QA at 440×956 and desktop could not be completed because the in-app browser had no available browser target in this session. The mobile rules are covered by the durable component test and production build, but a live viewport pass with seeded Read Later data remains advisable.
- This worktree has no database configuration, so save/status/file mutations were not exercised against a live database in browser QA. Shared boundary tests, action contract coverage, TypeScript, and the full build pass.
- The task brief named a Vitest component file, but this repository has no Vitest dependency and `npm test` only discovers `scripts/*.test.ts`; coverage was intentionally added as `scripts/read-later-ui.test.ts` so it runs in the standard suite.

## Review remediation — 2026-07-14

### Changes

- Replaced the absolute desktop filing popup with a full-width, in-flow disclosure inside each queue card. The queue may retain rounded-card clipping without hiding the filing form.
- Tightened the shared Project destination lookup to `active`, `parked`, and `someday`; unfiled Projects remain eligible and completed Projects are rejected.
- Replaced fire-and-forget status/file forms with reusable client controls backed by typed `{ ok, error }` server-action results, accessible live errors, pending disablement, and a per-item mutation coordinator that serializes rapid writes.
- Reused those controls on Reference detail so queue and detail have identical mutation/error semantics.
- Added explicit filing modes: omitted/`unchanged` preserves a duplicate's destination, `unfiled` clears it, and `area`/`project` validate and apply the selected destination.
- Built display paths from every non-system ancestor, including parked/retired ancestors, while exposing only active Areas as choices. Project paths use the Project's authoritative Area instead of the Reference's mirrored Area.
- Contained both metadata-fetch and enrichment-update failures inside the best-effort background job.
- Replaced the review-sensitive regex assertions with behavior tests for eligibility, filing intent, coordinator ordering, action results, background update isolation, inactive-ancestor paths, active-only choices, accessible pending/error UI, in-flow filing structure, and exact 44px actionable controls.

### Fresh verification

- `npx tsx --test scripts/read-later-ui.test.ts scripts/read-later-display.test.ts scripts/read-later-mutations.test.ts scripts/project-filing.test.ts scripts/read-later-hardening.test.ts scripts/read-later.test.ts` — PASS, 50/50.
- `npm test` — PASS, 169/169.
- `npx prisma validate` — PASS; schema valid.
- `npx tsc --noEmit --incremental false` — PASS, exit 0.
- `npm run lint` — PASS, exit 0.
- `npm run build` — PASS; production compilation, TypeScript, page generation, and standalone asset copy completed.
- `git diff --check` — PASS.

### Remaining concern

The environment limitations above remain: there is no available in-app browser target and no configured worktree database. The in-flow/no-clipping relationship, full path behavior, pending/error states, and 44px controls are covered by rendered-structure and behavior tests, but seeded live viewport/database QA remains advisable when those facilities are available.
