import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MIN_SEARCH_QUERY_LENGTH,
  mergeSearchCandidates,
  rankSearchResults,
  searchResultHref,
  strongTextWhere,
  type SearchCandidate,
} from "../src/lib/search-results";
import {
  loadIdeaSearchDetail,
  loadJournalSearchDetail,
} from "../src/lib/search-detail-loaders";
import { buildCandidates, type SearchRows } from "../src/app/search/page";

test("every searchable result kind maps to a precise entity or anchored parent", () => {
  assert.deepEqual(
    [
      searchResultHref({ kind: "capture", id: "c 1" }),
      searchResultHref({ kind: "task", id: "t/1" }),
      searchResultHref({ kind: "project", id: "p1" }),
      searchResultHref({ kind: "idea", id: "i1" }),
      searchResultHref({ kind: "reference", id: "r1" }),
      searchResultHref({ kind: "highlight", id: "h1", referenceId: "r1" }),
      searchResultHref({ kind: "note", id: "n1" }),
      searchResultHref({ kind: "doc", id: "d1", parentType: "area", parentId: "a1" }),
      searchResultHref({ kind: "doc", id: "d2", parentType: "project", parentId: "p1" }),
      searchResultHref({ kind: "doc", id: "d4", parentType: "journal_entry", parentId: "j1" }),
      searchResultHref({ kind: "doc", id: "d3", parentType: null, parentId: null }),
      searchResultHref({ kind: "check-in", id: "ci1" }),
      searchResultHref({ kind: "journal", id: "j1" }),
      searchResultHref({ kind: "person", id: "person1" }),
      searchResultHref({ kind: "person-fact", id: "f1", personId: "person1" }),
    ],
    [
      "/captures/c%201",
      "/tasks/t%2F1",
      "/projects/p1",
      "/ideas/items/i1",
      "/references/r1",
      "/references/r1#snippet-h1",
      "/notes/n1",
      "/areas/a1#doc-d1",
      "/projects/p1#doc-d2",
      "/journal/j1#doc-d4",
      "/areas/inbox#doc-d3",
      "/check-ins/ci1",
      "/journal/j1",
      "/people/person1",
      "/people/person1/facts/f1",
    ],
  );
});

test("detail loaders return killed Ideas and archived old Journal entries by ID", async () => {
  const ideaCalls: unknown[] = [];
  const journalCalls: unknown[] = [];
  const killedIdea = { id: "old-idea", status: "killed", title: "Retired radio plan" };
  const archivedJournal = { id: "old-journal", status: "archived", bodyMd: "Radio field day" };

  assert.equal(
    await loadIdeaSearchDetail(
      { idea: { findUnique: async (args) => (ideaCalls.push(args), killedIdea) } },
      "old-idea",
    ),
    killedIdea,
  );
  assert.equal(
    await loadJournalSearchDetail(
      { journalEntry: { findUnique: async (args) => (journalCalls.push(args), archivedJournal) } },
      "old-journal",
    ),
    archivedJournal,
  );
  assert.deepEqual(ideaCalls, [{ where: { id: "old-idea" }, include: { area: true, project: true } }]);
  assert.deepEqual(journalCalls, [{ where: { id: "old-journal" } }]);
});

test("an older exact result survives more than twenty recent weak matches", () => {
  const weak = Array.from({ length: 25 }, (_, index) =>
    candidate(`weak-${index}`, `Planning ${index}`, "radio in body", "Task", new Date(2026, 6, index + 1).toISOString()),
  );
  const exact = candidate("older-exact", "Radio", "", "Task", "2020-01-01T00:00:00.000Z");
  const fetched = mergeSearchCandidates([exact], weak.slice(0, 20));
  assert.equal(rankSearchResults(fetched, "radio")[0]?.id, "older-exact");
});

test("body-first values receive exact and prefix relevance", () => {
  const mapped = buildCandidates({
    captures: [{ id: "capture", rawText: "Radio", createdAt: new Date("2020-01-01") }],
    tasks: [], projects: [], ideas: [], references: [],
    entityNotes: [{ id: "note", bodyMd: "Radio", createdAt: new Date("2020-01-01") }],
    entityDocs: [],
    checkIns: [{ id: "check", bodyMd: "Radio", createdAt: new Date("2020-01-01") }],
    journalEntries: [{ id: "journal", bodyMd: "Radio", entryDate: new Date("2020-01-01"), updatedAt: new Date("2020-01-01") }],
    people: [],
    referenceSnippets: [{ id: "highlight", referenceId: "reference", quote: "Radio", note: null, createdAt: new Date("2020-01-01"), reference: { title: "Source", body: "Source body" } }],
    personFacts: [{ id: "fact", factValue: "Radio", createdAt: new Date("2020-01-01"), person: { id: "person", name: "Matt" } }],
  } as unknown as SearchRows);
  const recentWeakTitle = candidate("weak-title", "My radio notes", "", "Task", "2026-07-14T00:00:00.000Z");
  const oldExactCapture = mapped[0];
  assert.equal(mapped.length, 6);
  assert.ok(mapped.every((item) => item.primary === item.title));
  assert.deepEqual(rankSearchResults([recentWeakTitle, oldExactCapture], "radio").map((item) => item.id), ["capture", "weak-title"]);
});

test("short queries are not useful and strong bands are exact-or-prefix", () => {
  assert.equal(MIN_SEARCH_QUERY_LENGTH, 2);
  assert.deepEqual(strongTextWhere("title", "Radio"), {
    OR: [
      { title: { equals: "Radio", mode: "insensitive" } },
      { title: { startsWith: "Radio", mode: "insensitive" } },
    ],
  });
});

test("ranking prefers exact primary, prefix, primary body, then secondary matches", () => {
  const candidates: SearchCandidate[] = [
    candidate("secondary", "Unrelated", "Radio handbook"),
    candidate("body", "My radio handbook", ""),
    candidate("prefix", "Radio plans", ""),
    candidate("exact", "RADIO", ""),
  ];

  assert.deepEqual(
    rankSearchResults(candidates, " radio ").map((item) => item.id),
    ["exact", "prefix", "body", "secondary"],
  );
});

test("ranking is deterministic, recent within a band, and interleaves result kinds", () => {
  const candidates: SearchCandidate[] = [
    candidate("task-old", "Radio task", "", "Task", "2026-07-01T00:00:00.000Z"),
    candidate("task-new", "Radio tune", "", "Task", "2026-07-14T00:00:00.000Z"),
    candidate("project-new", "Radio project", "", "Project", "2026-07-13T00:00:00.000Z"),
    candidate("project-old", "Radio plan", "", "Project", "2026-07-02T00:00:00.000Z"),
  ];

  const first = rankSearchResults(candidates, "radio");
  const second = rankSearchResults([...candidates].reverse(), "radio");
  assert.deepEqual(first.map((item) => item.id), ["task-new", "project-new", "project-old", "task-old"]);
  assert.deepEqual(second.map((item) => item.id), first.map((item) => item.id));
});

test("ranking remains bounded", () => {
  const candidates = Array.from({ length: 80 }, (_, index) =>
    candidate(`task-${index}`, `Radio ${index}`, "", "Task", new Date(2026, 0, index + 1).toISOString()),
  );
  assert.equal(rankSearchResults(candidates, "radio", 40).length, 40);
});

test("search rows and anchored parent targets are mobile and keyboard accessible", () => {
  const search = readFileSync("src/app/search/page.tsx", "utf8");
  const depth = readFileSync("src/components/entity-depth.tsx", "utf8");
  const areas = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");

  assert.match(search, /className="block min-h-11[^\"]*focus-visible:ring-2/);
  assert.match(search, /break-words/);
  assert.doesNotMatch(search, /result\.href \?/);
  assert.match(search, /MIN_SEARCH_QUERY_LENGTH/);
  assert.match(search, /strongTextWhere/);
  assert.match(readFileSync("src/app/ideas/items/[ideaId]/page.tsx", "utf8"), /loadIdeaSearchDetail/);
  assert.match(readFileSync("src/app/journal/[entryId]/page.tsx", "utf8"), /loadJournalSearchDetail/);
  assert.match(depth, /id=\{`doc-\$\{doc\.id\}`\}/);
  assert.match(areas, /anchorId: `doc-\$\{item\.id\}`/);
});

function candidate(
  id: string,
  primary: string,
  secondary: string,
  type = "Task",
  updatedAt = "2026-07-10T00:00:00.000Z",
): SearchCandidate {
  return { id, type, title: primary, primary, secondary, updatedAt, href: `/tasks/${id}` };
}
