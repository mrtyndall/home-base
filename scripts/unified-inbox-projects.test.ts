import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const inboxPage = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const areasIndex = readFileSync("src/app/projects/page.tsx", "utf8");
const inboxLoader = readFileSync("src/lib/global-inbox.ts", "utf8");
const filingControl = readFileSync("src/components/inbox-filing-control.tsx", "utf8");
const filingCoordinator = readFileSync("src/lib/inbox-filing-coordinator.ts", "utf8");
const routinesView = readFileSync("src/components/routines-view.tsx", "utf8");

assert.match(
  inboxLoader,
  /client\.project\.findMany\(\{[\s\S]*?where:\s*\{\s*areaId:\s*null,\s*status:\s*\{\s*in:\s*\["active",\s*"someday",\s*"parked"\]/,
  "Inbox must load every unfinished unfiled Project state.",
);
assert.match(inboxPage, /data\.totalCount/, "The exact count must control the Inbox empty state.");
assert.match(inboxPage, /title="Projects"/, "Inbox must render an explicit Projects group.");
assert.match(inboxPage, /href=\{`\/projects\/\$\{project\.id\}`\}/, "Each Inbox Project must deep-link to its detail page.");
assert.match(inboxPage, /<InboxFilingControl/, "An unfiled Inbox Project must offer direct Area assignment.");
assert.match(filingControl, /<AreaPicker[\s\S]{0,180}areas=\{areas\}/, "Quick assignment must reuse the hierarchy-aware Area picker.");
assert.match(filingControl, /Assign area/, "The quick filing control must use direct, optional language.");
assert.match(filingCoordinator, /setTimeout\([\s\S]{0,180}6000\)/, "Successful filing must expose an exact six-second Undo window.");
assert.match(inboxPage, /hasNextPage/, "Every counted Inbox item must be reachable through pagination.");
assert.match(inboxPage, /title="Routines"/, "Active unfiled Routines must be visible in Inbox.");
assert.match(inboxPage, /href=\{`\/tasks#routine-\$\{routine\.id\}`\}/, "Each Inbox Routine must deep-link to its full Routine card.");
assert.match(routinesView, /id=\{`routine-\$\{routine\.id\}`\}/, "Routine deep links must have a stable target.");
assert.match(filingControl, /disabled=\{state\.pending\}/, "Filing choices must block competing input while a mutation is pending.");
assert.doesNotMatch(filingControl, /@\/lib\/(?:db|hierarchy)/, "The client filing control must not bundle server database dependencies.");

assert.match(areasIndex, /href="\/areas\/inbox"/, "The Areas index must always expose a stable Inbox entry.");
assert.match(areasIndex, /globalInboxCount/, "The Areas index must show a live global Inbox count.");
assert.match(
  inboxLoader,
  /client\.project\.count\(\{[\s\S]*?where:\s*\{\s*areaId:\s*null,\s*status:\s*\{\s*in:\s*\["active",\s*"someday",\s*"parked"\]/,
  "The Areas index count must include unfinished unfiled Projects.",
);
assert.match(areasIndex, /Inbox is clear/, "The permanent Inbox entry must remain useful at zero.");
assert.match(
  areasIndex,
  /href="\/areas\/inbox"[\s\S]{0,500}(?:min-h-11|h-11)/,
  "The Inbox entry must preserve a 44px mobile target.",
);
assert.doesNotMatch([inboxPage, areasIndex, inboxLoader, filingControl].join("\n"), /\bDomain\b|\bdomains\b/, "Inbox filing must stay Area-first.");
