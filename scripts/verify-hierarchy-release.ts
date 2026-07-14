import { pathToFileURL } from "node:url";
import { Pool } from "pg";

export type HierarchyReleaseCounts = {
  areaCycleCount: string;
  orphanAreaParentCount: string;
  orphanProjectAreaCount: string;
  taskProjectAreaMismatchCount: string;
  ideaProjectAreaMismatchCount: string;
  referenceProjectAreaMismatchCount: string;
  duplicateActiveReadLaterUrlCount: string;
  invalidReadLaterStatusCount: string;
  bookCount: string;
  movieCount: string;
  areaCount: string;
  projectCount: string;
  referenceCount: string;
};

export type HierarchyBaseline = {
  books: number;
  movies: number;
  areas: number;
  projects: number;
  references: number;
};

type ReleaseQueryClient = {
  query(sql: string): Promise<{ rows: unknown[] }>;
};

const baselineFields = [
  ["books", "expected-books"],
  ["movies", "expected-movies"],
  ["areas", "expected-areas"],
  ["projects", "expected-projects"],
  ["references", "expected-references"],
] as const;

function requiredCount(args: readonly string[], flag: string) {
  const prefix = `--${flag}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  const flagIndex = args.indexOf(`--${flag}`);
  const raw = inline?.slice(prefix.length) ?? (flagIndex >= 0 ? args[flagIndex + 1] : undefined);
  const value = raw === undefined ? Number.NaN : Number(raw);

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Supply --${flag} with the non-negative pre-release count.`);
  }
  return value;
}

export function parseHierarchyBaseline(args: readonly string[]): HierarchyBaseline | null {
  if (args.includes("--preflight")) return null;

  return Object.fromEntries(
    baselineFields.map(([field, flag]) => [field, requiredCount(args, flag)]),
  ) as HierarchyBaseline;
}

export function evaluateHierarchyRelease(
  counts: HierarchyReleaseCounts,
  baseline: HierarchyBaseline | null,
): string[] {
  const failures: string[] = [];

  for (const [label, value] of [
    ["Area cycles", counts.areaCycleCount],
    ["orphan Area parents", counts.orphanAreaParentCount],
    ["orphan Project Areas", counts.orphanProjectAreaCount],
    ["Task/Project Area mismatches", counts.taskProjectAreaMismatchCount],
    ["Idea/Project Area mismatches", counts.ideaProjectAreaMismatchCount],
    ["Reference/Project Area mismatches", counts.referenceProjectAreaMismatchCount],
    ["duplicate active Read Later normalized URLs", counts.duplicateActiveReadLaterUrlCount],
    ["invalid Read Later statuses", counts.invalidReadLaterStatusCount],
  ] as const) {
    if (Number(value) !== 0) failures.push(`${label}: ${value}`);
  }

  if (baseline) {
    for (const [label, actual, expected] of [
      ["Book", counts.bookCount, baseline.books],
      ["Movie", counts.movieCount, baseline.movies],
      ["Area", counts.areaCount, baseline.areas],
      ["Project", counts.projectCount, baseline.projects],
      ["Reference", counts.referenceCount, baseline.references],
    ] as const) {
      if (Number(actual) !== expected) {
        failures.push(`${label} count changed: expected ${expected}, found ${actual}`);
      }
    }
  }

  return failures;
}

async function releaseSchemaCapabilities(client: ReleaseQueryClient) {
  const result = await client.query(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'areas'
          AND column_name = 'parent_area_id'
      ) AS "hasParentAreaId",
      (
        SELECT COUNT(*) = 4
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'references'
          AND column_name IN ('normalized_url', 'read_status', 'saved_at', 'read_at')
      ) AS "hasReadLaterColumns"
  `);
  const row = result.rows[0] as {
    hasParentAreaId?: boolean;
    hasReadLaterColumns?: boolean;
  } | undefined;
  return {
    hasParentAreaId: row?.hasParentAreaId === true,
    hasReadLaterColumns: row?.hasReadLaterColumns === true,
  };
}

const retainedCountSelect = `
      (
        SELECT COUNT(*) FROM "projects" p
        LEFT JOIN "areas" a ON a."id" = p."area_id"
        WHERE p."area_id" IS NOT NULL AND a."id" IS NULL
      )::text AS "orphanProjectAreaCount",
      (
        SELECT COUNT(*) FROM "tasks" child
        LEFT JOIN "projects" p ON p."id" = child."project_id"
        WHERE child."project_id" IS NOT NULL
          AND (p."id" IS NULL OR child."area_id" IS DISTINCT FROM p."area_id")
      )::text AS "taskProjectAreaMismatchCount",
      (
        SELECT COUNT(*) FROM "ideas" child
        LEFT JOIN "projects" p ON p."id" = child."project_id"
        WHERE child."project_id" IS NOT NULL
          AND (p."id" IS NULL OR child."area_id" IS DISTINCT FROM p."area_id")
      )::text AS "ideaProjectAreaMismatchCount",
      (
        SELECT COUNT(*) FROM "references" child
        LEFT JOIN "projects" p ON p."id" = child."project_id"
        WHERE child."project_id" IS NOT NULL
          AND (p."id" IS NULL OR child."area_id" IS DISTINCT FROM p."area_id")
      )::text AS "referenceProjectAreaMismatchCount",
      (SELECT COUNT(*) FROM "references" WHERE "kind" = 'book')::text AS "bookCount",
      (SELECT COUNT(*) FROM "references" WHERE "kind" = 'movie')::text AS "movieCount",
      (SELECT COUNT(*) FROM "areas")::text AS "areaCount",
      (SELECT COUNT(*) FROM "projects")::text AS "projectCount",
      (SELECT COUNT(*) FROM "references")::text AS "referenceCount"
`;

const legacyReadLaterCountSelect = `
      0::text AS "duplicateActiveReadLaterUrlCount",
      0::text AS "invalidReadLaterStatusCount",
`;

const readLaterIntegritySelect = `
      (
        SELECT COUNT(*)
        FROM (
          SELECT "normalized_url"
          FROM "references"
          WHERE "kind" = 'read_later'
            AND "normalized_url" IS NOT NULL
            AND "read_status" IN ('unread', 'read')
          GROUP BY "normalized_url"
          HAVING COUNT(*) > 1
        ) duplicates
      )::text AS "duplicateActiveReadLaterUrlCount",
      (
        SELECT COUNT(*)
        FROM "references"
        WHERE "kind" = 'read_later'
          AND ("read_status" IS NULL OR "read_status" NOT IN ('unread', 'read', 'archived'))
      )::text AS "invalidReadLaterStatusCount",
`;

async function collectHierarchyReleaseCounts(
  client: ReleaseQueryClient,
  hasParentAreaId: boolean,
  hasReadLaterColumns: boolean,
) {
  const readLaterCountSelect = hasReadLaterColumns
    ? readLaterIntegritySelect
    : legacyReadLaterCountSelect;
  const sql = hasParentAreaId ? `
    WITH RECURSIVE "areaWalk" AS (
      SELECT
        a."id" AS "originId",
        a."parent_area_id" AS "nextId",
        ARRAY[a."id"]::text[] AS "path",
        false AS "cycle"
      FROM "areas" a

      UNION ALL

      SELECT
        walk."originId",
        parent."parent_area_id" AS "nextId",
        walk."path" || parent."id",
        parent."id" = ANY(walk."path") AS "cycle"
      FROM "areaWalk" walk
      JOIN "areas" parent ON parent."id" = walk."nextId"
      WHERE NOT walk."cycle"
    )
    SELECT
      (SELECT COUNT(DISTINCT "originId") FROM "areaWalk" WHERE "cycle")::text
        AS "areaCycleCount",
      (
        SELECT COUNT(*) FROM "areas" child
        LEFT JOIN "areas" parent ON parent."id" = child."parent_area_id"
        WHERE child."parent_area_id" IS NOT NULL AND parent."id" IS NULL
      )::text AS "orphanAreaParentCount",
      ${readLaterCountSelect}
      ${retainedCountSelect}
  ` : `
    SELECT
      0::text AS "areaCycleCount",
      0::text AS "orphanAreaParentCount",
      ${readLaterCountSelect}
      ${retainedCountSelect}
  `;
  const result = await client.query(sql);

  const counts = result.rows[0] as HierarchyReleaseCounts | undefined;
  if (!counts) throw new Error("Hierarchy release count query returned no rows.");
  return counts;
}

function baselineFlags(counts: HierarchyReleaseCounts) {
  return [
    `--expected-books=${counts.bookCount}`,
    `--expected-movies=${counts.movieCount}`,
    `--expected-areas=${counts.areaCount}`,
    `--expected-projects=${counts.projectCount}`,
    `--expected-references=${counts.referenceCount}`,
  ].join(" ");
}

export async function runHierarchyReleaseVerification(
  client: ReleaseQueryClient,
  args: readonly string[],
  log: (line: string) => void = console.log,
) {
  const baseline = parseHierarchyBaseline(args);
  let operationFailed = false;
  let operationError: unknown;
  let successMessage = "";

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const { hasParentAreaId, hasReadLaterColumns } = await releaseSchemaCapabilities(client);
    if (baseline !== null && !hasParentAreaId) {
      throw new Error(
        "Hierarchy release verification failed: areas.parent_area_id is missing; run strict postflight after the hierarchy migration.",
      );
    }
    if (baseline !== null && !hasReadLaterColumns) {
      throw new Error(
        "Hierarchy release verification failed: Read Later columns are missing; run strict postflight after the Read Later migration.",
      );
    }
    const counts = await collectHierarchyReleaseCounts(
      client,
      hasParentAreaId,
      hasReadLaterColumns,
    );
    const failures = evaluateHierarchyRelease(counts, baseline);
    if (failures.length > 0) {
      throw new Error(`Hierarchy release verification failed:\n- ${failures.join("\n- ")}`);
    }

    if (baseline === null) {
      successMessage = `Hierarchy preflight passed. Post-release baseline: ${baselineFlags(counts)}`;
    } else {
      successMessage = `Hierarchy release verified (Books: ${counts.bookCount}, Movies: ${counts.movieCount}, Areas: ${counts.areaCount}, Projects: ${counts.projectCount}, References: ${counts.referenceCount}).`;
    }
  } catch (error: unknown) {
    operationFailed = true;
    operationError = error;
  }

  try {
    await client.query("ROLLBACK");
  } catch (rollbackError: unknown) {
    if (operationFailed) {
      if (operationError instanceof Error) {
        Object.defineProperty(operationError, "rollbackError", {
          configurable: true,
          value: rollbackError,
        });
      }
      throw operationError;
    }
    const detail = rollbackError instanceof Error ? rollbackError.message : "unknown rollback error";
    throw new Error(`Hierarchy release cleanup failed: ${detail}`, { cause: rollbackError });
  }

  if (operationFailed) throw operationError;
  log(successMessage);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await runHierarchyReleaseVerification(
      { query: async (sql) => client.query(sql) },
      process.argv.slice(2),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Hierarchy release verification failed.");
    process.exitCode = 1;
  });
}
