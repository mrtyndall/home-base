import { pathToFileURL } from "node:url";
import { Pool } from "pg";

export type HierarchyReleaseCounts = {
  areaCycleCount: string;
  orphanAreaParentCount: string;
  orphanProjectAreaCount: string;
  taskProjectAreaMismatchCount: string;
  ideaProjectAreaMismatchCount: string;
  referenceProjectAreaMismatchCount: string;
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

async function collectHierarchyReleaseCounts(client: ReleaseQueryClient) {
  const result = await client.query(`
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
  `);

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

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const counts = await collectHierarchyReleaseCounts(client);
    const failures = evaluateHierarchyRelease(counts, baseline);
    if (failures.length > 0) {
      throw new Error(`Hierarchy release verification failed:\n- ${failures.join("\n- ")}`);
    }

    if (baseline === null) {
      log(`Hierarchy preflight passed. Post-release baseline: ${baselineFlags(counts)}`);
    } else {
      log(
        `Hierarchy release verified (Books: ${counts.bookCount}, Movies: ${counts.movieCount}, Areas: ${counts.areaCount}, Projects: ${counts.projectCount}, References: ${counts.referenceCount}).`,
      );
    }
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
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
