import { Pool } from "pg";

type MigrationCounts = {
  projectInboxCount: string;
  contentInboxCount: string;
  taskProjectAreaMismatchCount: string;
  projectWithoutAreaCount: string;
  bookCount: string;
  movieCount: string;
};

function requiredCount(name: "expected-books" | "expected-movies") {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  const flagIndex = process.argv.indexOf(`--${name}`);
  const raw = inline?.slice(prefix.length) ?? (flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined);
  const value = raw === undefined ? Number.NaN : Number(raw);

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Supply --${name} with the non-negative pre-migration count.`);
  }

  return value;
}

function assertDisposableLocalDatabase(connectionString: string | undefined) {
  if (process.env.AREA_FIRST_DISPOSABLE_DATABASE !== "1") {
    throw new Error("Set AREA_FIRST_DISPOSABLE_DATABASE=1 only for a disposable local restore.");
  }
  if (!connectionString) {
    throw new Error("DATABASE_URL must reference a disposable local restore.");
  }

  const { hostname } = new URL(connectionString);
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)) {
    throw new Error("Migration verification is restricted to localhost/127.0.0.1 disposable databases.");
  }
}

async function main() {
  const expectedBooks = requiredCount("expected-books");
  const expectedMovies = requiredCount("expected-movies");
  assertDisposableLocalDatabase(process.env.DATABASE_URL);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<MigrationCounts>(`
      SELECT
        (SELECT COUNT(*) FROM "projects" WHERE "area_id" = 'area_inbox')::text
          AS "projectInboxCount",
        (
          (SELECT COUNT(*) FROM "tasks" WHERE "area_id" = 'area_inbox') +
          (SELECT COUNT(*) FROM "routines" WHERE "area_id" = 'area_inbox') +
          (SELECT COUNT(*) FROM "ideas" WHERE "area_id" = 'area_inbox') +
          (SELECT COUNT(*) FROM "references" WHERE "area_id" = 'area_inbox') +
          (SELECT COUNT(*) FROM "people" WHERE "area_id" = 'area_inbox') +
          (SELECT COUNT(*) FROM "capture_review_proposals" WHERE "suggested_area_id" = 'area_inbox') +
          (SELECT COUNT(*) FROM "entity_notes" WHERE "parent_type" = 'area' AND "parent_id" = 'area_inbox') +
          (SELECT COUNT(*) FROM "entity_docs" WHERE "parent_type" = 'area' AND "parent_id" = 'area_inbox') +
          (SELECT COUNT(*) FROM "documents" WHERE "parent_type" = 'area' AND "parent_id" = 'area_inbox')
        )::text AS "contentInboxCount",
        (
          SELECT COUNT(*)
          FROM "tasks" t
          LEFT JOIN "projects" p ON p."id" = t."project_id"
          WHERE t."project_id" IS NOT NULL
            AND (p."id" IS NULL OR t."area_id" IS NULL OR t."area_id" IS DISTINCT FROM p."area_id")
        )::text AS "taskProjectAreaMismatchCount",
        (SELECT COUNT(*) FROM "projects" WHERE "area_id" IS NULL)::text
          AS "projectWithoutAreaCount",
        (SELECT COUNT(*) FROM "references" WHERE "kind" = 'book')::text
          AS "bookCount",
        (SELECT COUNT(*) FROM "references" WHERE "kind" = 'movie')::text
          AS "movieCount"
    `);
    const counts = result.rows[0];
    const failures: string[] = [];

    for (const [label, value] of [
      ["projects still referencing area_inbox", counts.projectInboxCount],
      ["eligible content still referencing area_inbox", counts.contentInboxCount],
      ["project tasks with absent/mismatched mirrored Areas", counts.taskProjectAreaMismatchCount],
      ["projects without an Area", counts.projectWithoutAreaCount],
    ] as const) {
      if (Number(value) !== 0) failures.push(`${label}: ${value}`);
    }
    if (Number(counts.bookCount) !== expectedBooks) {
      failures.push(`Book count changed: expected ${expectedBooks}, found ${counts.bookCount}`);
    }
    if (Number(counts.movieCount) !== expectedMovies) {
      failures.push(`Movie count changed: expected ${expectedMovies}, found ${counts.movieCount}`);
    }

    if (failures.length > 0) {
      throw new Error(`Area-first migration verification failed:\n- ${failures.join("\n- ")}`);
    }

    console.log(
      `Area-first migration verified (Books: ${counts.bookCount}, Movies: ${counts.movieCount}).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Area-first migration verification failed.");
  process.exitCode = 1;
});
