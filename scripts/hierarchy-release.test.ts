import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHierarchyRelease,
  parseHierarchyBaseline,
  runHierarchyReleaseVerification,
  type HierarchyReleaseCounts,
} from "./verify-hierarchy-release";

const cleanCounts: HierarchyReleaseCounts = {
  areaCycleCount: "0",
  orphanAreaParentCount: "0",
  orphanProjectAreaCount: "0",
  taskProjectAreaMismatchCount: "0",
  ideaProjectAreaMismatchCount: "0",
  referenceProjectAreaMismatchCount: "0",
  bookCount: "12",
  movieCount: "8",
  areaCount: "5",
  projectCount: "7",
  referenceCount: "23",
};

test("preflight reports all preservation baselines without requiring expected flags", () => {
  assert.equal(parseHierarchyBaseline(["--preflight"]), null);
  assert.deepEqual(evaluateHierarchyRelease(cleanCounts, null), []);
});

test("strict verification requires and parses all five preservation counts", () => {
  assert.deepEqual(
    parseHierarchyBaseline([
      "--expected-books=12",
      "--expected-movies", "8",
      "--expected-areas=5",
      "--expected-projects", "7",
      "--expected-references=23",
    ]),
    { books: 12, movies: 8, areas: 5, projects: 7, references: 23 },
  );
  assert.throws(
    () => parseHierarchyBaseline(["--expected-books=12"]),
    /--expected-movies/,
  );
});

test("verification rejects cycles, orphans, every Project-child mismatch, and count drift", () => {
  const failures = evaluateHierarchyRelease(
    {
      ...cleanCounts,
      areaCycleCount: "2",
      orphanAreaParentCount: "1",
      orphanProjectAreaCount: "3",
      taskProjectAreaMismatchCount: "4",
      ideaProjectAreaMismatchCount: "5",
      referenceProjectAreaMismatchCount: "6",
      bookCount: "11",
      movieCount: "9",
      areaCount: "4",
      projectCount: "8",
      referenceCount: "22",
    },
    { books: 12, movies: 8, areas: 5, projects: 7, references: 23 },
  );

  for (const detail of [
    "Area cycles: 2",
    "orphan Area parents: 1",
    "orphan Project Areas: 3",
    "Task/Project Area mismatches: 4",
    "Idea/Project Area mismatches: 5",
    "Reference/Project Area mismatches: 6",
    "Book count changed: expected 12, found 11",
    "Movie count changed: expected 8, found 9",
    "Area count changed: expected 5, found 4",
    "Project count changed: expected 7, found 8",
    "Reference count changed: expected 23, found 22",
  ]) assert.ok(failures.includes(detail), detail);
});

test("database verification uses one read-only transaction and always rolls it back", async () => {
  const queries: string[] = [];
  const output: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (/WITH RECURSIVE/.test(sql)) return { rows: [cleanCounts] };
      return { rows: [] };
    },
  };

  await runHierarchyReleaseVerification(client, ["--preflight"], (line) => output.push(line));

  assert.equal(queries[0], "BEGIN TRANSACTION READ ONLY");
  assert.match(queries[1], /WITH RECURSIVE/);
  assert.match(queries[1], /FROM "tasks"/);
  assert.match(queries[1], /FROM "ideas"/);
  assert.match(queries[1], /FROM "references"/);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.match(output.join("\n"), /--expected-books=12/);
  assert.match(output.join("\n"), /--expected-references=23/);
});

test("database verification rolls back before surfacing an integrity failure", async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (/WITH RECURSIVE/.test(sql)) {
        return { rows: [{ ...cleanCounts, orphanProjectAreaCount: "1" }] };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    runHierarchyReleaseVerification(client, ["--preflight"], () => undefined),
    /orphan Project Areas: 1/,
  );
  assert.equal(queries.at(-1), "ROLLBACK");
});
