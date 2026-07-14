# Task 3 Report — Replace Domain and Inbox-Area Runtime Assumptions

## Status

IMPLEMENTED WITH EXPECTED TASK 4 BUILD BOUNDARY. The focused runtime contract, full test suite, scoped lint, and diff checks pass. The full Next.js build stops at the reserved legacy Domain page, which Task 4 owns; no Task 4 UI file was modified.

## RED evidence

The new runtime contract was written before production changes.

Command:

```text
npx tsx scripts/area-first-runtime.test.ts
```

Observed expected failure:

```text
AssertionError [ERR_ASSERTION]: runtime must not use the retired Inbox Area
```

The first full-suite run after the runtime cutover also exposed two stale expectations, proving the existing contracts still encoded Inbox-Area links and Domain-grouped project filters:

```text
npm test
tests 47; pass 45; fail 2
```

Failures were `scripts/home-attention.test.ts` and `scripts/task-filter-options.test.ts`; their expected values were updated to the specified global capture links and Area grouping.

## GREEN evidence

Fresh final focused contract:

```text
npx tsx scripts/area-first-runtime.test.ts
exit 0
```

Fresh final full suite:

```text
npm test
tests 47; pass 47; fail 0
```

Scoped lint over every changed runtime/test source:

```text
npx eslint <all changed Task 3 TypeScript files>
exit 0
```

Diff hygiene:

```text
git diff --check
exit 0
```

## Runtime changes

- Added `resolveVerifiedDestination()` to the shared destination contract. It accepts an unfiled destination, validates an active Area, and rejects Project/Area mismatches.
- Made Task creation nullable and routed audited Task writes through the shared resolver. Project selection derives the Project Area.
- Added `getAreaAggregate(areaId)` and removed the Domain aggregate module.
- Removed Domain routes, schemas, query includes, response fields, and Area fallback behavior from the bearer API while preserving authenticated API access.
- Made Task, Idea, Reference, Entity Note, Entity Doc, Document attachment, and capture conversion destinations nullable.
- Kept Project creation Area-required and active-Area validated.
- Made API Project moves transactional and mirrored the new Area to child Tasks, Ideas, and References.
- Replaced Domain-grouped filters/options/parser context/review context with directly ordered Areas.
- Removed all Task 3 runtime references to `area_inbox` and rerouted capture/review attention to global anchors.
- Added capture UUID idempotency keys, sequential retry replay, conflicting-key rejection, and manual conversion duplicate prevention.
- Removed client-controlled API audit identity; API capture identity is now passed only from the authenticated server context.
- Preserved global Book/Movie lookup creation behavior; no Book/Movie-specific write path was changed.

## Exact files

Created:

- `scripts/area-first-runtime.test.ts`
- `src/lib/areas.ts`

Deleted:

- `src/lib/domains.ts`

Modified:

- `scripts/home-attention.test.ts`
- `scripts/task-filter-options.test.ts`
- `src/lib/destinations.ts`
- `src/lib/tasks.ts`
- `src/lib/capture/service.ts`
- `src/lib/capture/review-proposals.ts`
- `src/lib/capture/parser.ts` (compile/contract repair required by Area-only parser context)
- `src/lib/capture/types.ts` (idempotency and nullable note/doc action contract)
- `src/lib/task-filter-options.ts`
- `src/lib/home-attention.ts`
- `src/lib/chat.ts`
- `src/app/api/v1/[...path]/route.ts`
- `src/app/api/capture/options/route.ts`
- `src/app/api/tasks/[taskId]/assignment/route.ts`
- `src/app/api/tasks/quick/route.ts` (compile-only caller rename for nullable task creation)
- `src/app/api/documents/presign/route.ts` (required nullable Document destination)
- `src/app/actions.ts`
- `src/app/review-actions.ts`

No UI component/page file was modified.

## Residual compile/build gaps

`npm run build` generates Prisma Client and begins the optimized Next.js build, then fails at the reserved Task 4 page `src/app/domains/[domainId]/page.tsx` because it still imports deleted `@/lib/domains` and removed `updateDomainDescription`. This is the intentional UI cutover boundary.

`npx tsc --noEmit` reports 129 diagnostics, all outside Task 3 runtime files. They are concentrated in Task 4 UI pages/components plus legacy `prisma/seed.ts`, `scripts/import-apple-reminders.ts`, and `src/lib/today.ts`, which still use Domain or assume required Areas. Filtering the compiler output to all changed Task 3 runtime files produces no diagnostics.

## Self-review

- Verified every actual `Domain`, `domainId`, `area_inbox`, default-Area, and destination mutation call site with `rg`; the focused contract enforces their absence in the Task 3 runtime surface.
- Confirmed no production, Railway, main checkout, iOS worktree, or UI file was touched.
- Confirmed resolver use before eligible writes and active-Area validation before Project creation/moves.
- Confirmed the Project move transaction updates the Project and all three mirrored child models atomically.
- Confirmed API capture labels cannot come from `deviceContext`; only the authenticated API key label reaches audit metadata.
- Confirmed repeated capture UUIDs return prior parsed results and reused UUIDs with different content are rejected.
- Known limitation: two truly concurrent first submissions with the same UUID can both observe an unparsed row before either finishes. Sequential offline/client retries are idempotent; fully serialized concurrent execution would require a database claim/lock field in a later schema task.
- Known boundary: global Inbox presentation and Domain-page removal are not buildable until Task 4 completes the reserved UI cutover.

## Review fixes — concurrency, validation, and atomicity

### Findings resolved

- Capture processing now validates trusted API actor context before parsing or writing a Capture row.
- Each capture UUID is serialized with `pg_advisory_xact_lock(hashtext(captureId))` inside an interactive Prisma transaction.
- Capture creation, all action side effects, notifications/mentions, and the final `parseStatus`/`createdItems` update use the same transaction client. A crash or thrown action rolls the entire attempt back; the failed/pending fallback is written in a fresh locked transaction.
- Transaction-client propagation was added to the Task, check-in, reference-mention, person, routine, and resurfacing helpers used by capture execution. Existing non-capture callers retain the default Prisma client.
- Manual capture conversion now locks by Capture ID and performs the duplicate check, target creation, mention updates, review/proposal settlement, notification, and `createdItems` update in one transaction.
- Capture Note/Entity Doc destinations now pass through `resolveVerifiedDestination()` with the transaction client, so a parked Area is rejected rather than accepted by the fuzzy matcher.
- Explicit invalid Area/Project values are rejected by quick Task actions/API, Task editing, bearer API writes, and explicit capture-intent processing. Only omitted/blank destinations become unfiled.
- Added `normalizeParentDestination()` with behavioral checks for paired `parentType`/`parentId` and conflicting legacy/alias destination fields.
- Unfiled note starring/editing no longer constructs or revalidates `/projects/null`.

### Review RED evidence

After adding the new regression contracts and before implementation:

```text
npx tsx scripts/area-first-runtime.test.ts
AssertionError [ERR_ASSERTION]: idempotent capture processing must acquire a transaction-scoped database lock
```

The expanded contract covers advisory-lock structure, transaction-scoped action/final-state writes, absence of global Prisma writes in capture execution helpers, trusted-actor validation order, explicit-invalid capture rejection, locked conversion structure, null-safe revalidation, quick API invalid-destination rejection, resolver use, and behavioral destination/parent normalization failures.

### Review GREEN evidence

Focused runtime contract:

```text
npx tsx scripts/area-first-runtime.test.ts
exit 0
```

Full suite:

```text
npm test
tests 47; pass 47; fail 0
```

Scoped lint and diff hygiene:

```text
npx eslint scripts/area-first-runtime.test.ts src/lib/destinations.ts src/lib/capture/service.ts src/lib/tasks.ts src/lib/people.ts src/lib/reference-mentions.ts src/lib/checkins.ts src/lib/routines.ts src/lib/resurfacing.ts src/app/actions.ts 'src/app/api/v1/[...path]/route.ts' src/app/api/tasks/quick/route.ts
exit 0

git diff --check
exit 0
```

Compile audit:

```text
npx tsc --noEmit
129 diagnostics remain, all outside the Task 3 runtime files; filtering for every changed Task 3 runtime file returns no diagnostics.
```

Production build boundary is unchanged:

```text
npm run build
Turbopack build failed with 2 errors in src/app/domains/[domainId]/page.tsx:
- cannot resolve the deleted @/lib/domains module
- removed updateDomainDescription export is still imported
```

No Task 4 UI, schema/migration, Railway, production, main-checkout, or iOS file was modified during review fixes.
