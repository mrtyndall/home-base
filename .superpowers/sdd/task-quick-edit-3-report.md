# Task 3 Report — Reusable Adaptive Task Quick Edit

## Status

Complete. Task detail, Tasks, and Today now share one adaptive `TaskQuickEdit` surface. The former unassigned-only detail form and list scheduling/assignment popover are retired.

## Delivered

- Direct, always-visible Location and Schedule facts on open task detail pages.
- One 44px quick-edit trigger for task list cards and Today cards.
- Mobile fixed bottom sheet with internal scrolling, persistent-chrome/safe-area clearance, long-path wrapping, and reduced-motion-safe transitions; desktop uses a centered dialog treatment.
- Today, Tomorrow, This weekend, Next week, native custom date, Someday, and No date choices using the reviewed date helpers.
- Lazy destination loading only when Move opens, with search, Inbox, full Area/Project path labels, and device-local recent destination IDs.
- Optimistic label updates and close, per-operation stale-response guards, authoritative response labels, rollback plus Retry, and six-second Undo through the validated PATCH routes.
- Dialog labelling, Escape dismissal, focus restoration/trapping, keyboard focus rings, polite status announcements, and minimum 44px action rows.
- Removed eager task-detail assignment option loading and stopped sending Area/Project option arrays into list quick edit.
- Retired `src/components/task-quick-assignment.tsx` and the old inline list menu.
- Fixed Project detail's Area disclosure with `min-w-0`, `break-words`, and `overflow-wrap:anywhere`.
- Updated superseded source contracts to validate the lazy endpoint and unified editor.

## Verification

- `npx tsx --test scripts/task-quick-edit-ui.test.ts` — PASS (1/1).
- `npm test` — PASS (117/117, 0 failures).
- `npx tsc --noEmit` — PASS.
- `npx eslint src/components/task-quick-edit.tsx src/components/task-scheduling.tsx 'src/app/tasks/[taskId]/page.tsx' src/app/tasks/page.tsx src/app/today/page.tsx 'src/app/projects/[projectId]/page.tsx' scripts/task-quick-edit-ui.test.ts scripts/task-assignment-options.test.ts scripts/task-quick-assignment-ui.test.ts` — PASS (0 errors, 0 warnings).
- `npm run build` — PASS; Next.js production compilation, TypeScript, 19 static pages, route generation, and standalone asset copy all completed.
- `git diff --check` — PASS.

## Concerns

- No live DB-backed browser fixture was available in this task run, so 440×956, 390×844, and 1440×1000 behavior is protected by responsive source contracts and production compilation rather than screenshot-based interaction testing.

## Review remediation

- Replaced the shared operation token with independent schedule and location `MutationChannel` instances. Each channel serializes server writes, keeps unrelated channel state independent, clears superseded Undo state, queues Undo/Retry through the same writer, and reconciles changed props only while idle.
- Added behavioral tests against the exact coordinator, latest-request runner, and storage helpers imported by `TaskQuickEdit`, covering ordering, stale UI protection, channel independence, exact Undo history, rollback/Retry, prop reconciliation, request cancellation/generation, and storage exceptions.
- Added one `--app-dock-clearance` layout token shared by `AppDock`, the mobile sheet, and portal status surfaces. The sheet now sits above the collapsed capture bar, inter-control gap, nav, and safe-area boundary with its max height calculated from the same token.
- Added distinct Location, Schedule, and list trigger refs; exact-opener restoration; first-action focus on each view; and complete forward/backward Tab wrapping.
- Destination fetches now use `AbortController` plus request generations. Close, unmount, task changes, and replacement requests invalidate older success and failure results.
- Isolated all local-storage access behind exception-safe helpers.
- Tasks and Today loaders now decorate tasks and subtasks with hierarchy-derived full Area paths before rendering initial labels.
- Moved error/Retry and Undo UI into card-width portals above the shared dock boundary.

### Review verification

- `npx tsx --test scripts/task-quick-edit-coordinator.test.ts scripts/task-quick-edit-ui.test.ts` — PASS (9/9).
- `npm test` — PASS (125/125, 0 failures).
- `npx tsc --noEmit` — PASS.
- `npx eslint src/components/task-quick-edit.tsx src/lib/task-quick-edit-coordinator.ts scripts/task-quick-edit-coordinator.test.ts scripts/task-quick-edit-ui.test.ts src/components/app-dock.tsx src/lib/today.ts src/app/today/page.tsx src/app/tasks/page.tsx` — PASS (0 errors, 0 warnings).
- `npm run build` — PASS; optimized compilation, TypeScript, 19 static pages, route generation, and standalone asset copy completed.
- `git diff --check` — PASS.

## Final reconciliation follow-up

- `MutationChannel.reconcile` now distinguishes equivalent committed values from genuine external changes. Equivalent values refresh the visible authoritative value/label while retaining the active Undo or persistent error/Retry state; genuinely different server values replace the committed value and clear stale recovery.
- Location equivalence is based on destination identity rather than display label, allowing hierarchy-label refreshes without discarding recovery state.
- The shared dock token now reserves 8.25rem (132px) of collapsed chrome before adding the baseline/device safe-area inset.
- Added behavioral coverage for success followed by same-value prop reconciliation retaining Undo, failed schedule followed by unrelated location refresh retaining schedule Retry, and genuinely different external state clearing recovery.

### Final follow-up verification

- `npx tsx --test scripts/task-quick-edit-coordinator.test.ts scripts/task-quick-edit-ui.test.ts` — PASS (12/12).
- `npm test` — PASS (128/128, 0 failures).
- `npx tsc --noEmit` — PASS.
- `npx eslint src/components/task-quick-edit.tsx src/lib/task-quick-edit-coordinator.ts scripts/task-quick-edit-coordinator.test.ts scripts/task-quick-edit-ui.test.ts` — PASS (0 errors, 0 warnings).
- `npm run build` — PASS; optimized compilation, TypeScript, 19 static pages, route generation, and standalone asset copy completed.
- `git diff --check` — PASS.
