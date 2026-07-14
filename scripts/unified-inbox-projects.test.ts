import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const inboxPage = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const areasIndex = readFileSync("src/app/projects/page.tsx", "utf8");

const inboxLoader = inboxPage.slice(
  inboxPage.indexOf("async function loadGlobalInbox"),
  inboxPage.indexOf("async function loadArea"),
);

assert.match(
  inboxLoader,
  /prisma\.project\.findMany\(\{[\s\S]*?where:\s*\{\s*areaId:\s*null,\s*status:\s*\{\s*in:\s*\["active",\s*"someday",\s*"parked"\]/,
  "Inbox must load every unfinished unfiled Project state.",
);
assert.match(inboxPage, /data\.projects\.length/, "Projects must contribute to the Inbox total and empty state.");
assert.match(inboxPage, /title="Projects"/, "Inbox must render an explicit Projects group.");
assert.match(inboxPage, /href=\{`\/projects\/\$\{project\.id\}`\}/, "Each Inbox Project must deep-link to its detail page.");
assert.match(inboxPage, /action=\{updateProjectArea\}/, "An unfiled Inbox Project must offer direct Area assignment.");
assert.match(inboxPage, /<AreaPicker[\s\S]{0,180}areas=\{areas\}/, "Quick assignment must reuse the hierarchy-aware Area picker.");
assert.match(inboxPage, /Assign area/, "The quick filing control must use direct, optional language.");

assert.match(areasIndex, /href="\/areas\/inbox"/, "The Areas index must always expose a stable Inbox entry.");
assert.match(areasIndex, /globalInboxCount/, "The Areas index must show a live global Inbox count.");
assert.match(
  areasIndex,
  /prisma\.project\.count\(\{[\s\S]*?where:\s*\{\s*areaId:\s*null,\s*status:\s*\{\s*in:\s*\["active",\s*"someday",\s*"parked"\]/,
  "The Areas index count must include unfinished unfiled Projects.",
);
assert.match(areasIndex, /Inbox is clear/, "The permanent Inbox entry must remain useful at zero.");
assert.match(
  areasIndex,
  /href="\/areas\/inbox"[\s\S]{0,500}(?:min-h-11|h-11)/,
  "The Inbox entry must preserve a 44px mobile target.",
);
assert.doesNotMatch([inboxPage, areasIndex].join("\n"), /\bDomain\b|\bdomains\b/, "Inbox filing must stay Area-first.");
