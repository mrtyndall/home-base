# Task 5 Report — Migration integrity and release verification

## Status

Implemented the read-only nested hierarchy release gate, wired `verify:hierarchy-release`, documented the new hierarchy and current agent routes, and verified both CLI modes against a disposable migrated PostgreSQL database. No Railway service or canonical database was contacted.

## RED evidence

Added `scripts/hierarchy-release.test.ts` before the verifier existed, with wished-for pure/injected interfaces for baseline parsing, integrity evaluation, read-only transaction behavior, and rollback on failure.

```text
npx tsx --test scripts/hierarchy-release.test.ts
```

Observed result: 0 passed, 1 failed. The runner reported `Cannot find module './verify-hierarchy-release'`, the expected missing implementation rather than an assertion typo.

## GREEN implementation

- Added `scripts/verify-hierarchy-release.ts` with an explicitly read-only transaction and unconditional rollback.
- The recursive Area walk detects self-cycles and multi-node cycles; left joins report orphan Area parents and orphan Project Area references.
- Task, Idea, and Reference rows with a Project are checked with null-safe `IS DISTINCT FROM` comparison against the Project's optional Area.
- Preflight prints Book, Movie, Area, Project, and total Reference baseline flags. Strict mode requires all five flags and rejects count drift.
- Added the `verify:hierarchy-release` package command.
- Updated README and architecture guidance for nested Areas, optional Project Areas, mirrored Project children, migration gates, and the current REST, MCP, and in-app chat hierarchy surfaces.

## GREEN evidence

Focused test after implementation:

```text
npx tsx --test scripts/hierarchy-release.test.ts
```

Result: 5 passed, 0 failed.

A disposable local PostgreSQL 17 container was created with trust authentication and a dynamically assigned localhost port. All 27 committed migrations applied successfully. Preflight then printed the empty-schema baseline and strict verification accepted the same values:

```text
Hierarchy preflight passed. Post-release baseline: --expected-books=0 --expected-movies=0 --expected-areas=1 --expected-projects=0 --expected-references=0
Hierarchy release verified (Books: 0, Movies: 0, Areas: 1, Projects: 0, References: 0).
```

The disposable container was stopped and removed. The configured shell had no `DATABASE_URL`; no Railway preflight or production mutation was attempted.

Complete quality gate from the task brief:

```text
npm test
npm run lint
npx tsc --noEmit --incremental false
npx prisma validate
npm run build
git diff --check
```

Result: every command exited 0; the full suite reported 94 passed and 0 failed, Prisma reported a valid schema, and Next.js completed the production build.

The first build attempt exposed a worktree-only dependency layout issue: the worktree had cache directories but no local installed packages, while `turbopack.root` correctly restricted compilation to the worktree. `npm ci` restored the lockfile dependency tree locally, after which the unchanged full gate passed.

## Self-review

- Confirmed the verifier contains no data-changing SQL and wraps its single count query in `BEGIN TRANSACTION READ ONLY` plus `ROLLBACK`.
- Confirmed cycles stop recursion after the first repeated node, preventing an infinite recursive walk.
- Confirmed nullable unfiled Project/child pairs compare equal, while a child Area differing in either direction is reported.
- Confirmed all Project-bearing mirrored child tables in the current schema are covered: Tasks, Ideas, and References.
- Confirmed CLI imports do not open a database connection during unit tests.
- Confirmed documentation route/tool names against the current REST handler, MCP registrations, and chat tool list.

## Concerns

- The development database smoke test used a fresh migrated schema, not representative application data. Pure/injected tests cover every failure category and baseline drift, but release operators must still run preflight and strict postflight against the intended database at release time.
- `npm ci` reported five pre-existing moderate dependency vulnerabilities. No dependency versions or lockfile entries changed in this task.
