import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { parseObsidianReferenceNote } from "./import-obsidian-references";

type ParsedArtworkReference = {
  kind: "book" | "movie";
  title: string;
  sourcePath: string;
  body: string;
  tags: string[];
  url?: string;
  metadata: Record<string, unknown>;
};

const defaultVault =
  process.env.OBSIDIAN_VAULT_PATH ?? "/Users/matt/Documents/Quicksilver2";

const dryRun = process.argv.includes("--dry-run");
const sqlMode = process.argv.includes("--sql");

async function main() {
  const obsidianReferences = loadObsidianReferences();
  if (sqlMode) {
    await emitSqlUpdates(obsidianReferences);
    return;
  }

  const bySourcePath = new Map(
    obsidianReferences.map((reference) => [reference.sourcePath, reference]),
  );
  const byTitle = new Map(
    obsidianReferences.map((reference) => [
      normalizeTitle(reference.title),
      reference,
    ]),
  );

  const references = await prisma.reference.findMany({
    where: { kind: { in: ["book", "movie"] } },
    select: {
      id: true,
      title: true,
      body: true,
      kind: true,
      metadata: true,
      sourcePath: true,
    },
    take: 5000,
  });

  let booksUpdated = 0;
  let moviesUpdated = 0;
  let moviesSkipped = 0;

  for (const reference of references) {
    const metadata = metadataObject(reference.metadata);
    if (metadata.coverUrl) continue;

    const obsidian =
      (reference.sourcePath ? bySourcePath.get(reference.sourcePath) : null) ??
      byTitle.get(normalizeTitle(reference.title ?? reference.body));

    if (reference.kind === "book") {
      const cover = stringValue(metadata.cover) ?? stringValue(obsidian?.metadata.cover);
      if (!cover) continue;

      await updateReferenceArtwork(reference.id, metadata, {
        coverUrl: cover,
        artworkSource: "obsidian",
      });
      booksUpdated += 1;
      continue;
    }

    const imdbUrl = stringValue(metadata.imdb) ?? stringValue(obsidian?.metadata.imdb);
    const imdbId = imdbUrl?.match(/tt\d+/)?.[0];
    if (!imdbId) {
      moviesSkipped += 1;
      continue;
    }

    const poster = await scrapeImdbPoster(imdbId);
    if (!poster) {
      moviesSkipped += 1;
      continue;
    }

    await updateReferenceArtwork(reference.id, metadata, {
      imdb: imdbUrl,
      coverUrl: poster,
      artworkSource: "imdb-suggestion",
    });
    moviesUpdated += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        booksUpdated,
        moviesUpdated,
        moviesSkipped,
      },
      null,
      2,
    ),
  );
}

async function emitSqlUpdates(references: ParsedArtworkReference[]) {
  let statements = 0;
  console.log("\\set ON_ERROR_STOP on");
  console.log("begin;");

  for (const reference of references) {
    if (reference.kind === "book") {
      const cover = stringValue(reference.metadata.cover);
      if (!cover) continue;
      console.log(
        updateSql(reference, {
          coverUrl: cover,
          artworkSource: "obsidian",
        }),
      );
      statements += 1;
      continue;
    }

    const imdbUrl = stringValue(reference.metadata.imdb);
    const imdbId = imdbUrl?.match(/tt\d+/)?.[0];
    if (!imdbId) continue;
    const poster = await scrapeImdbPoster(imdbId);
    if (!poster) continue;
    console.log(
      updateSql(reference, {
        imdb: imdbUrl,
        coverUrl: poster,
        artworkSource: "imdb-suggestion",
      }),
    );
    statements += 1;
  }

  console.log("commit;");
  console.error(`Generated ${statements} artwork update statements.`);
}

function loadObsidianReferences(): ParsedArtworkReference[] {
  const referencesDir = path.join(defaultVault, "References");
  if (!fs.existsSync(referencesDir)) return [];

  return fs
    .readdirSync(referencesDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(referencesDir, file))
    .map((file) =>
      parseObsidianReferenceNote(file, fs.readFileSync(file, "utf8")),
    )
    .filter(
      (reference): reference is ParsedArtworkReference =>
        Boolean(
          reference &&
            (reference.kind === "book" || reference.kind === "movie"),
        ),
    );
}

async function scrapeImdbPoster(imdbId: string) {
  const url = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(
    imdbId,
  )}.json`;
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "HomeBase reference artwork enrichment" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { d?: unknown[] };
    const items = Array.isArray(data.d) ? data.d : [];
    const exact = items
      .map((item) => (isRecord(item) ? item : null))
      .find((item) => item?.id === imdbId);
    const image = isRecord(exact?.i) ? exact.i.imageUrl : null;
    return typeof image === "string" && image.trim() ? image : null;
  } catch {
    return null;
  }
}

async function updateReferenceArtwork(
  referenceId: string,
  currentMetadata: Record<string, unknown>,
  artworkMetadata: Record<string, unknown>,
) {
  if (dryRun) return;

  const metadata = {
    ...currentMetadata,
    ...artworkMetadata,
  };

  await prisma.reference.update({
    where: { id: referenceId },
    data: { metadata: metadata as Prisma.InputJsonObject },
  });
}

function metadataObject(value: unknown) {
  return isRecord(value) ? { ...value } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function updateSql(
  reference: ParsedArtworkReference,
  artworkMetadata: Record<string, unknown>,
) {
  const metadataJson = JSON.stringify(artworkMetadata);
  return [
    'update "references"',
    `set metadata = coalesce(metadata, '{}'::jsonb) || ${sqlString(metadataJson)}::jsonb`,
    `where kind = ${sqlString(reference.kind)}`,
    "and nullif(metadata->>'coverUrl', '') is null",
    `and (source_path = ${sqlString(reference.sourcePath)} or lower(coalesce(title, body)) = ${sqlString(normalizeTitle(reference.title))});`,
  ].join("\n");
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeTitle(value: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
