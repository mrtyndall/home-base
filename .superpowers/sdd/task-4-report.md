# Task 4 Report — REST, capture, MCP, and compatibility cleanup

## Status

Implemented and committed as `f158d86` (`feat: expose area hierarchy to agents`).

## RED evidence

The contract tests were added/updated before production code. The exact brief-prescribed discovery command selected `scripts/verify-api-contract.ts` and `scripts/api-hierarchy-contract.test.ts`.

```text
files=$(rg -l 'create_area|create_project|list_areas' src mcp scripts | rg 'test|verify')
for file in ${(f)files}; do npx tsx --test "$file"; done
```

Both files failed for the intended absent behavior. The first assertion in each reported that the REST route did not use `assertValidAreaParent`; no setup or syntax error obscured the failure.

The existing `scripts/area-first-runtime.test.ts` contract was also inverted before implementation so capture-created Projects were required to allow an omitted Area and label that result `Unfiled`.

## GREEN implementation

- REST Project create accepts omitted/null `areaId`; Project patch files to an Area or null through `fileProject`.
- REST Area create/patch accepts `parentAreaId`, validates through `assertValidAreaParent`, and returns stable `{ error: { code, message } }` bodies with HTTP 400 for self-parent, cycle, and missing-parent failures.
- Area list/detail reads add slash-separated hierarchy `path` values while retaining `parentAreaId`.
- Capture parser explicitly permits unfiled Projects and forbids inventing an Area; capture execution only rejects a named Area that cannot be matched.
- MCP adds `reparent_area` and `file_project`, makes Project Area inputs nullable, proxies REST only, and removes `read_domain_page` plus all active Domain-era schemas/descriptions.
- Chat adds a hierarchy-ordered, path-labelled `list_areas` read tool.
- Added `scripts/api-hierarchy-contract.test.ts` and `scripts/verify-api-contract.ts`; updated the prior capture runtime contract.

## GREEN evidence

Focused API/capture/MCP/hierarchy verification:

```text
npx tsx --test scripts/api-hierarchy-contract.test.ts scripts/area-first-runtime.test.ts scripts/hierarchy.test.ts scripts/project-filing.test.ts scripts/capture-options-runtime.test.ts scripts/capture-file-confirmation.test.ts
```

Result: 18 passed, 0 failed.

Final verification immediately before commit:

```text
npm test
npx tsc --noEmit
npx eslint src/app/api/v1/'[...path]'/route.ts src/lib/capture/parser.ts src/lib/capture/service.ts src/lib/chat.ts mcp/http-server.ts scripts/api-hierarchy-contract.test.ts scripts/area-first-runtime.test.ts scripts/verify-api-contract.ts
npx tsx scripts/verify-api-contract.ts
git diff --check
```

Result: all commands exited 0; full suite 75 passed, 0 failed; API hierarchy contract verified; TypeScript, scoped lint, and diff check were clean.

## Concerns

- API/MCP contract coverage is source-contract based because the repository has no isolated authenticated REST/MCP integration harness. Shared hierarchy and filing behavior is exercised directly by the focused runtime tests, but a deployed authenticated smoke test remains worthwhile.

## Review remediation — behavior and transaction hardening

Implemented in `76f136d` (`fix: harden hierarchy agent contracts`). This supersedes the source-regex coverage concern above: the hierarchy contracts now execute injected service, authentication, error-response, and MCP proxy behavior.

### Review RED evidence

Behavior tests were added before the remediation implementation:

```text
npx tsx --test scripts/api-hierarchy-behavior.test.ts scripts/api-auth-behavior.test.ts scripts/mcp-hierarchy-behavior.test.ts
```

Observed result: 1 passed, 4 failed. The hierarchy API and MCP tests failed because the wished-for behavior modules did not exist. The authenticated write tests reached the live Prisma client instead of the injected fake, proving `authenticateApiRequest` had no testable client boundary. These were the expected missing interfaces, not assertion typos.

A later focused RED check added the generic internal-error outcome and failed specifically because `toApiErrorResponse` did not exist. After implementation it returns a sanitized HTTP 500 and does not classify internal failures as hierarchy validation.

### Review GREEN implementation

- Added `src/lib/api/hierarchy.ts` as the behavior boundary used by the REST route for Project/Area create, patch, list, auditing, and stable error responses.
- Project POST and PATCH share `resolveEligibleProjectAreaReference`, which requires `status: active` and `isSystem: false` for ID and name lookup.
- Added `mutateProject`; it performs the Project update, child Area mirrors, one activity, and one notification in a single transaction. API calls emit only `api:<label>` activity plus an API audit source. `fileProject` remains the manual-provenance wrapper used by web actions.
- Project create, activity, and audit also execute in one transaction.
- Area list first fetches the complete hierarchy projection, flattens it deterministically, applies the limit, and then fetches full rows for the selected IDs. A 102-node behavior case verifies late descendants are not promoted or path-corrupted by a pre-tree limit.
- Typed hierarchy/project mutation errors map conflicts and invalid destinations to stable 400 responses, missing reparent targets to 404, and generic/Prisma-style failures to a sanitized 500.
- Area creation uses a generated non-empty UUID. Parent IDs are trimmed; optional empty parents normalize to null. Direct hierarchy tests reject empty current IDs and prove empty parents perform no lookup.
- Replaced `scripts/api-hierarchy-contract.test.ts` with behavior suites for API mutation/rollback/audit, auth/scope, and MCP schemas/proxy payloads. `scripts/verify-api-contract.ts` now executes behavior assertions instead of source regex.
- Extracted MCP hierarchy schemas/proxy request construction to `mcp/hierarchy-tools.ts`; the live MCP registrations use those same schemas and request builders.

### Review GREEN evidence

Focused behavior command:

```text
npx tsx --test scripts/api-hierarchy-behavior.test.ts scripts/api-auth-behavior.test.ts scripts/mcp-hierarchy-behavior.test.ts scripts/project-filing.test.ts scripts/hierarchy.test.ts
```

Result: 29 passed, 0 failed.

Final pre-commit verification:

```text
npm test
npx tsc --noEmit
npx eslint src/app/api/v1/'[...path]'/route.ts src/lib/api/auth.ts src/lib/api/hierarchy.ts src/lib/hierarchy.ts mcp/http-server.ts mcp/hierarchy-tools.ts scripts/api-auth-behavior.test.ts scripts/api-hierarchy-behavior.test.ts scripts/hierarchy.test.ts scripts/mcp-hierarchy-behavior.test.ts scripts/project-filing.test.ts scripts/verify-api-contract.ts
npx tsx scripts/verify-api-contract.ts
git diff --check
```

Result: all commands exited 0; full suite 89 passed, 0 failed; TypeScript and scoped ESLint passed; verifier printed `API hierarchy behavior contract verified.`; diff check was clean.

### Remaining concern

- No deployed database/MCP smoke test was requested or run. Transaction rollback is asserted through a rollback-capable fake client, while the same production boundary is typed against Prisma and passes the full TypeScript suite.
