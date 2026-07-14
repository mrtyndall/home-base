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
  duplicateActiveReadLaterUrlCount: "0",
  invalidReadLaterStatusCount: "0",
  bookCount: "12",
  movieCount: "8",
  areaCount: "5",
  projectCount: "7",
  referenceCount: "23",
};

const completeReadLaterProtection = {
  hasParentAreaId: true,
  hasReadLaterColumns: true,
  readLaterStatusConstraintDefinition:
    "CHECK ((read_status = ANY (ARRAY['unread'::text, 'read'::text, 'archived'::text])))",
  readLaterActiveUrlIndexDefinition:
    "CREATE UNIQUE INDEX references_active_read_later_normalized_url_key ON public.references USING btree (normalized_url) WHERE ((kind = 'read_later'::text) AND (normalized_url IS NOT NULL) AND (read_status = ANY (ARRAY['unread'::text, 'read'::text])))",
  readLaterActiveUrlIndexPredicate:
    "kind = 'read_later'::text AND normalized_url IS NOT NULL AND (read_status = ANY (ARRAY['unread'::text, 'read'::text]))",
  readLaterActiveUrlIndexIsUnique: true,
  readLaterActiveUrlIndexIsValid: true,
  readLaterActiveUrlIndexIsReady: true,
  readLaterActiveUrlIndexKeyDefinition: "normalized_url",
  readLaterActiveUrlIndexKeyCount: 1,
  readLaterActiveUrlIndexAttributeCount: 1,
};

const strictArgs = [
  "--expected-books=12",
  "--expected-movies=8",
  "--expected-areas=5",
  "--expected-projects=7",
  "--expected-references=23",
];

async function runStrictWithProtection(overrides: Record<string, unknown>) {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (/information_schema\.columns/.test(sql)) {
        return { rows: [{ ...completeReadLaterProtection, ...overrides }] };
      }
      if (/WITH RECURSIVE/.test(sql)) return { rows: [cleanCounts] };
      return { rows: [] };
    },
  };
  await runHierarchyReleaseVerification(client, strictArgs, () => undefined);
  return queries;
}

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

test("verification rejects hierarchy failures, Read Later corruption, and count drift", () => {
  const failures = evaluateHierarchyRelease(
    {
      ...cleanCounts,
      areaCycleCount: "2",
      orphanAreaParentCount: "1",
      orphanProjectAreaCount: "3",
      taskProjectAreaMismatchCount: "4",
      ideaProjectAreaMismatchCount: "5",
      referenceProjectAreaMismatchCount: "6",
      duplicateActiveReadLaterUrlCount: "7",
      invalidReadLaterStatusCount: "8",
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
    "duplicate active Read Later normalized URLs: 7",
    "invalid Read Later statuses: 8",
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
      if (/information_schema\.columns/.test(sql)) {
        return { rows: [{ hasParentAreaId: true, hasReadLaterColumns: true }] };
      }
      if (/WITH RECURSIVE/.test(sql)) return { rows: [cleanCounts] };
      return { rows: [] };
    },
  };

  await runHierarchyReleaseVerification(client, ["--preflight"], (line) => output.push(line));

  assert.equal(queries[0], "BEGIN TRANSACTION READ ONLY");
  assert.match(queries[1], /information_schema\.columns/);
  assert.match(queries[2], /WITH RECURSIVE/);
  assert.match(queries[2], /FROM "tasks"/);
  assert.match(queries[2], /FROM "ideas"/);
  assert.match(queries[2], /FROM "references"/);
  assert.match(queries[2], /"normalized_url"/);
  assert.match(queries[2], /"read_status"/);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.match(output.join("\n"), /--expected-books=12/);
  assert.match(output.join("\n"), /--expected-references=23/);
});

test("preflight uses a legacy-safe count query before parent_area_id exists", async () => {
  const queries: string[] = [];
  const output: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (/information_schema\.columns/.test(sql)) return { rows: [{ hasParentAreaId: false }] };
      if (/AS "areaCycleCount"/.test(sql)) return { rows: [cleanCounts] };
      return { rows: [] };
    },
  };

  await runHierarchyReleaseVerification(client, ["--preflight"], (line) => output.push(line));

  assert.match(queries[1], /information_schema\.columns/);
  assert.doesNotMatch(queries[2], /parent_area_id|WITH RECURSIVE/);
  assert.doesNotMatch(queries[2], /normalized_url|read_status/);
  assert.match(queries[2], /0::text AS "areaCycleCount"/);
  assert.match(queries[2], /FROM "tasks"/);
  assert.match(queries[2], /FROM "ideas"/);
  assert.match(queries[2], /FROM "references"/);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.match(output.join("\n"), /--expected-areas=5/);
});

test("strict postflight requires the additive Read Later columns", async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (/information_schema\.columns/.test(sql)) {
        return { rows: [{ hasParentAreaId: true, hasReadLaterColumns: false }] };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    runHierarchyReleaseVerification(client, [
      "--expected-books=12",
      "--expected-movies=8",
      "--expected-areas=5",
      "--expected-projects=7",
      "--expected-references=23",
    ]),
    /Read Later columns are missing/,
  );
  assert.equal(queries.at(-1), "ROLLBACK");
});

test("strict postflight rejects all columns with the named status constraint missing", async () => {
  await assert.rejects(
    runStrictWithProtection({ readLaterStatusConstraintDefinition: null }),
    /Read Later status constraint is missing or invalid/,
  );
});

test("preflight remains safe on a partial schema with columns but no protections", async () => {
  const output: string[] = [];
  const client = {
    async query(sql: string) {
      if (/information_schema\.columns/.test(sql)) {
        return {
          rows: [{
            ...completeReadLaterProtection,
            readLaterStatusConstraintDefinition: null,
            readLaterActiveUrlIndexDefinition: null,
            readLaterActiveUrlIndexPredicate: null,
            readLaterActiveUrlIndexIsUnique: false,
            readLaterActiveUrlIndexIsValid: false,
            readLaterActiveUrlIndexIsReady: false,
          }],
        };
      }
      if (/WITH RECURSIVE/.test(sql)) return { rows: [cleanCounts] };
      return { rows: [] };
    },
  };

  await runHierarchyReleaseVerification(client, ["--preflight"], (line) => output.push(line));
  assert.match(output.join("\n"), /--expected-references=23/);
});

test("strict postflight rejects a status constraint with the wrong allowed values", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterStatusConstraintDefinition:
        "CHECK ((read_status = ANY (ARRAY['unread'::text, 'read'::text, 'deleted'::text])))",
    }),
    /Read Later status constraint is missing or invalid/,
  );
});

test("strict postflight rejects all columns with the named active URL index missing", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexDefinition: null,
      readLaterActiveUrlIndexPredicate: null,
      readLaterActiveUrlIndexIsUnique: null,
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight rejects a non-unique active URL index", async () => {
  await assert.rejects(
    runStrictWithProtection({ readLaterActiveUrlIndexIsUnique: false }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight rejects an invalid active URL index", async () => {
  await assert.rejects(
    runStrictWithProtection({ readLaterActiveUrlIndexIsValid: false }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight rejects an unready active URL index", async () => {
  await assert.rejects(
    runStrictWithProtection({ readLaterActiveUrlIndexIsReady: false }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight rejects a named active URL index on the wrong key", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexDefinition:
        "CREATE UNIQUE INDEX references_active_read_later_normalized_url_key ON public.references USING btree (url) WHERE ((kind = 'read_later'::text) AND (normalized_url IS NOT NULL) AND (read_status = ANY (ARRAY['unread'::text, 'read'::text])))",
      readLaterActiveUrlIndexKeyDefinition: "url",
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight rejects an active URL index with additional key columns", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexKeyDefinition: "normalized_url, id",
      readLaterActiveUrlIndexKeyCount: 2,
      readLaterActiveUrlIndexAttributeCount: 2,
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight rejects an active URL index with the wrong predicate", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexPredicate:
        "((kind = 'read_later'::text) AND (normalized_url IS NOT NULL) AND (read_status = 'unread'::text))",
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight rejects a negated status clause that contains the expected substrings", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexPredicate:
        "((kind = 'read_later'::text) AND (normalized_url IS NOT NULL) AND (NOT (read_status = ANY (ARRAY['unread'::text, 'read'::text]))))",
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight preserves literal case when comparing the index predicate", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexPredicate:
        "kind = 'READ_LATER'::text AND normalized_url IS NOT NULL AND (read_status = ANY (ARRAY['unread'::text, 'read'::text]))",
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight does not erase cast-like text inside a predicate literal", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexPredicate:
        "kind = 'read::text_later'::text AND normalized_url IS NOT NULL AND (read_status = ANY (ARRAY['unread'::text, 'read'::text]))",
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight preserves status literal case", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexPredicate:
        "kind = 'read_later'::text AND normalized_url IS NOT NULL AND (read_status = ANY (ARRAY['Unread'::text, 'read'::text]))",
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight preserves doubled quotes and parentheses inside literals", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexPredicate:
        "kind = 'read_''later)'::text AND normalized_url IS NOT NULL AND (read_status = ANY (ARRAY['unread'::text, 'read'::text]))",
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight rejects an otherwise-correct predicate with an extra clause", async () => {
  await assert.rejects(
    runStrictWithProtection({
      readLaterActiveUrlIndexPredicate:
        "((kind = 'read_later'::text) AND (normalized_url IS NOT NULL) AND (read_status = ANY (ARRAY['unread'::text, 'read'::text])) AND (url IS NOT NULL))",
    }),
    /Read Later active URL index is missing or invalid/,
  );
});

test("strict postflight accepts the complete named Read Later protection schema", async () => {
  const queries = await runStrictWithProtection({});
  assert.equal(queries[0], "BEGIN TRANSACTION READ ONLY");
  assert.equal(queries.at(-1), "ROLLBACK");
});

test("database verification rolls back before surfacing an integrity failure", async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (/information_schema\.columns/.test(sql)) return { rows: [{ hasParentAreaId: true }] };
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

test("successful verification fails when its read-only rollback fails", async () => {
  const output: string[] = [];
  const client = {
    async query(sql: string) {
      if (sql === "ROLLBACK") throw new Error("connection lost during rollback");
      if (/information_schema\.columns/.test(sql)) return { rows: [{ hasParentAreaId: true }] };
      if (/WITH RECURSIVE/.test(sql)) return { rows: [cleanCounts] };
      return { rows: [] };
    },
  };

  await assert.rejects(
    runHierarchyReleaseVerification(client, ["--preflight"], (line) => output.push(line)),
    /Hierarchy release cleanup failed: connection lost during rollback/,
  );
  assert.deepEqual(output, [], "success must not be reported before rollback succeeds");
});

test("verification error remains primary when rollback also fails", async () => {
  const verificationError = new Error("count query failed");
  const client = {
    async query(sql: string) {
      if (sql === "ROLLBACK") throw new Error("rollback also failed");
      if (/information_schema\.columns/.test(sql)) return { rows: [{ hasParentAreaId: true }] };
      if (/WITH RECURSIVE/.test(sql)) throw verificationError;
      return { rows: [] };
    },
  };

  await assert.rejects(
    runHierarchyReleaseVerification(client, ["--preflight"], () => undefined),
    (error: unknown) => error === verificationError,
  );
  assert.match(
    String((verificationError as Error & { rollbackError?: Error }).rollbackError?.message),
    /rollback also failed/,
  );
});
