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
