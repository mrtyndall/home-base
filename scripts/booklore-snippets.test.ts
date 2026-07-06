import assert from "node:assert/strict";
import fs from "node:fs";

const sync = fs.readFileSync("src/lib/booklore-snippets.ts", "utf8");
const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const referencePage = fs.readFileSync(
  "src/app/references/[referenceId]/page.tsx",
  "utf8",
);

assert.ok(
  sync.includes("BOOKLORE_BASE_URL") &&
    sync.includes("BOOKLORE_TOKEN") &&
    sync.includes("/api/v1/annotations/book/") &&
    sync.includes("/api/v2/book-notes/book/"),
  "BookLore snippet sync should read annotations and notes from the configured BookLore instance.",
);
assert.ok(
  sync.includes("referenceSnippet.upsert") &&
    sync.includes("providerId") &&
    !sync.includes("deleteMany"),
  "BookLore snippet sync should upsert append-safely and never delete local snippet records.",
);
assert.ok(
  actions.includes("export async function syncBookLoreSnippetsAction") &&
    actions.includes("export async function setReferenceSnippetStarred"),
  "Reference snippets need explicit server actions for sync and starring.",
);
assert.ok(
  referencePage.includes("BookLore highlight") &&
    referencePage.includes("BookLore note") &&
    referencePage.includes('id={`snippet-${snippet.id}`}'),
  "Reference detail should distinguish synced highlights and notes and expose stable anchors.",
);
