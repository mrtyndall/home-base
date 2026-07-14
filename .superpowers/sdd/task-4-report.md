# Task 4 report — Area-first web experience

## Status

Implemented the Area-first web rollout in the assigned worktree. The compatibility index remains `/projects`, the primary label is now Areas, Area creation is name-only, Project creation can be locked to a validated query-supplied Area, and the existing Inbox surface is now global at `/areas/inbox` without a synthetic Inbox Area.

## RED / GREEN evidence

- RED command: `npx tsx --test scripts/area-creation-ui.test.ts scripts/project-area-creation-ui.test.ts scripts/global-inbox-ui.test.ts`
- RED result: 0 passed, 3 failed for the expected missing behaviors: no Area creation route, no query-scoped Project form, and no global unfiled Inbox.
- GREEN command: same focused command.
- GREEN result: 3 passed, 0 failed.
- Regression result after moving the Inbox off Home and onto the existing Inbox surface: `npm test` passed 50/50.

## Verification

- `npx tsc --noEmit` — exit 0.
- `npm test` — 50 passed, 0 failed.
- `npm run lint` — exit 0.
- `npm run build` — exit 0; Next compiled, TypeScript completed, 19 static pages generated, standalone assets copied.
- `git diff --check` — clean.

## Disposable runtime QA

A local Postgres 17 disposable database was created in a throwaway Docker container, all migrations were applied, the repaired seed was executed, and synthetic pending/unfiled fixtures were added. No production or Railway state was used.

HTTP smoke checks all returned 200:

- `/projects` rendered Areas, New area, and New project.
- `/areas/new` rendered the name-focused Area form.
- `/projects/new?areaId=area_seed_home` rendered fixed `Create in Home` context.
- `/areas/inbox` rendered Pending captures and unfiled Tasks, Ideas, References, and Notes.

Cleanup was verified: the disposable container was removed and the local dev server was stopped.

## Screenshots / remaining QA need

No screenshots were captured. The in-app browser runtime reported zero available browser targets, so desktop/narrow visual inspection, keyboard focus traversal, and interactive form submission could not be performed in this task. These remain manual QA needs despite clean source-contract, runtime HTTP, TypeScript, lint, and production-build evidence.

## Exact files

Created:

- `src/app/areas/new/page.tsx`
- `scripts/area-creation-ui.test.ts`
- `scripts/project-area-creation-ui.test.ts`
- `scripts/global-inbox-ui.test.ts`

Deleted:

- `src/app/domains/[domainId]/page.tsx`

Modified:

- `prisma/seed.ts`
- `scripts/home-attention.test.ts`
- `scripts/import-apple-reminders.ts`
- `scripts/seed-runtime.mjs`
- `src/app/actions.ts`
- `src/app/api/v1/[...path]/route.ts`
- `src/app/areas/[areaId]/page.tsx`
- `src/app/captures/[captureId]/page.tsx`
- `src/app/ideas/page.tsx`
- `src/app/notes/[noteId]/page.tsx`
- `src/app/page.tsx`
- `src/app/people/[personId]/page.tsx`
- `src/app/projects/[projectId]/page.tsx`
- `src/app/projects/new/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/tasks/[taskId]/page.tsx`
- `src/app/tasks/page.tsx`
- `src/app/today/page.tsx`
- `src/components/capture-file-actions.tsx`
- `src/components/check-in-feed.tsx`
- `src/components/nav-tabs.tsx`
- `src/components/task-scheduling.tsx`
- `src/lib/home-attention.ts`
- `src/lib/today.ts`

## Concerns

- The expand migration intentionally retains a required physical `areas.domain_id` column until the later contract release, while the generated Prisma model no longer exposes it. Fresh-database QA revealed that ordinary `prisma.area.create()` in seed code therefore violates the physical null constraint. The seed paths now use parameterized raw inserts solely for new Areas, assigning the hidden compatibility group; web/runtime UI and DTOs do not expose Domains. The later contract migration should remove this compatibility code with the physical column.
- Interactive screenshot, narrow-layout, keyboard-focus, and click-through creation QA still needs a browser-enabled task.

## Review remediation

The seven review findings were addressed in a follow-up pass:

- Added the isolated expand-schema shim `src/lib/area-compat.ts`. It upserts and returns the actual hidden System Domain ID with parameterized SQL, then creates an Area with the still-required physical `domain_id`. `createArea` and the Prisma seed share this helper. The module is explicitly marked for deletion with the contract migration.
- Updated the runtime JavaScript seed to use the System ID returned by `ON CONFLICT ... DO UPDATE ... RETURNING id`; neither seed assumes `domain_system` owns the unique System name.
- Reworked capture options around the flat `{ areas, projects }` response and added runtime normalization. System Areas are excluded from the API response.
- Rejected system Areas in `createProject`, including forged form posts.
- Limited Inbox References to `kind: "reference"` before the result cap, added unfiled Entity Docs and uploaded Documents, and replaced all remaining `/#inbox` backlinks with `/areas/inbox`.

Follow-up TDD evidence:

- RED: the five focused review tests failed for the intended missing behaviors.
- GREEN: `npx tsx --test scripts/area-creation-ui.test.ts scripts/capture-options-runtime.test.ts scripts/project-area-creation-ui.test.ts scripts/global-inbox-ui.test.ts scripts/seed-area-compat.test.ts` passed 5/5.
- Full suite: `npm test` passed 52/52.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` exited successfully.

Disposable PostgreSQL 17 integration QA migrated a fresh loopback database, changed the existing System row to a non-default ID, created an Area through `createCompatibleArea`, and verified its name, next sort order, physical foreign key, non-system visibility, and Domain-free return shape. It also ran both seed implementations against that row. The throwaway database was dropped and absence was verified afterward.
