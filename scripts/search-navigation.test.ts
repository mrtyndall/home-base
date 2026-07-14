import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  rankSearchResults,
  searchResultHref,
  type SearchCandidate,
} from "../src/lib/search-results";

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
      "/ideas#idea-i1",
      "/references/r1",
      "/references/r1#snippet-h1",
      "/notes/n1",
      "/areas/a1#doc-d1",
      "/projects/p1#doc-d2",
      "/areas/inbox#doc-d3",
      "/check-ins/ci1",
      "/ideas#journal-j1",
      "/people/person1",
      "/people/person1/facts/f1",
    ],
  );
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
  const library = readFileSync("src/app/ideas/page.tsx", "utf8");
  const depth = readFileSync("src/components/entity-depth.tsx", "utf8");
  const areas = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");

  assert.match(search, /className="block min-h-11[^\"]*focus-visible:ring-2/);
  assert.match(search, /break-words/);
  assert.doesNotMatch(search, /result\.href \?/);
  assert.match(library, /id=\{`idea-\$\{idea\.id\}`\}/);
  assert.match(library, /id=\{`journal-\$\{entry\.id\}`\}/);
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
