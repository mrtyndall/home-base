import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const home = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const inboxData = readFileSync("src/lib/global-inbox.ts", "utf8");
const areaPage = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const nav = readFileSync("src/components/nav-tabs.tsx", "utf8");
const fileActions = readFileSync("src/components/capture-file-actions.tsx", "utf8");

assert.match(home, /function GlobalInbox/, "The existing Inbox surface must render globally unfiled content.");
assert.match(inboxData, /areaId:\s*null/, "Inbox must load unfiled records rather than a synthetic Inbox Area.");
for (const type of ["tasks", "ideas", "references", "notes"] as const) {
  assert.match(inboxData, new RegExp(`\\b${type}\\b`), `Inbox must include unfiled ${type}.`);
}
assert.match(inboxData, /kind:\s*"reference"/, "Inbox References must exclude book and movie library records before applying the cap.");
assert.match(inboxData, /entityDocs/, "Inbox must query unfiled Entity Docs.");
assert.match(inboxData, /documents/, "Inbox must query unfiled uploaded Documents.");
assert.match(home, /title="Docs"/, "Inbox must render unfiled Entity Docs.");
assert.match(home, /title="Files"/, "Inbox must render unfiled uploaded Documents.");
assert.match(home, /Pending captures/, "Inbox must include pending captures.");
assert.match(home, /Inbox is clear/, "Inbox must have a calm empty state.");
assert.doesNotMatch(home, /unfiled[^\n<]{0,80}(?:error|warning)|(?:error|warning)[^\n<]{0,80}unfiled/i, "Unfiled content must never be framed as an error.");
assert.doesNotMatch([home, areaPage, nav, fileActions].join("\n"), /area_inbox/, "UI must not depend on the retired Inbox Area.");
assert.doesNotMatch(fileActions, /\bDomain\b|\bdomains\b/, "Filing controls must consume flat Areas.");
assert.equal(existsSync("src/app/domains/[domainId]/page.tsx"), false, "The legacy Domain page must be removed.");

for (const file of [
  "src/app/captures/[captureId]/page.tsx",
  "src/app/notes/[noteId]/page.tsx",
  "src/components/check-in-feed.tsx",
]) {
  assert.doesNotMatch(readFileSync(file, "utf8"), /\/#inbox/, `${file} must link to the global Inbox route.`);
}
