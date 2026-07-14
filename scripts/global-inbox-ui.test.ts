import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const home = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const areaPage = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const nav = readFileSync("src/components/nav-tabs.tsx", "utf8");
const fileActions = readFileSync("src/components/capture-file-actions.tsx", "utf8");

assert.match(home, /function GlobalInbox/, "The existing Inbox surface must render globally unfiled content.");
assert.match(home, /areaId:\s*null/, "Inbox must load unfiled records rather than a synthetic Inbox Area.");
for (const type of ["tasks", "ideas", "references", "notes"] as const) {
  assert.match(home, new RegExp(`\\b${type}\\b`), `Inbox must include unfiled ${type}.`);
}
assert.match(home, /Pending captures/, "Inbox must include pending captures.");
assert.match(home, /Inbox is clear/, "Inbox must have a calm empty state.");
assert.doesNotMatch(home, /unfiled[^\n<]{0,80}(?:error|warning)|(?:error|warning)[^\n<]{0,80}unfiled/i, "Unfiled content must never be framed as an error.");
assert.doesNotMatch([home, areaPage, nav, fileActions].join("\n"), /area_inbox/, "UI must not depend on the retired Inbox Area.");
assert.doesNotMatch(fileActions, /\bDomain\b|\bdomains\b/, "Filing controls must consume flat Areas.");
assert.equal(existsSync("src/app/domains/[domainId]/page.tsx"), false, "The legacy Domain page must be removed.");
