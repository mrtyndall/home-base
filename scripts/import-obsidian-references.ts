import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";

type ImportKind = "person" | "book" | "movie" | "reference";

type ParsedReference = {
  kind: ImportKind;
  title: string;
  sourcePath: string;
  body: string;
  url?: string;
  tags: string[];
  metadata: Record<string, unknown>;
};

const defaultVault =
  process.env.OBSIDIAN_VAULT_PATH ?? "/Users/matt/Documents/Quicksilver2";

export function sanitizeWikiValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeWikiValue(item))
      .filter((item) => item !== "" && item !== null && item !== undefined);
  }

  if (typeof value !== "string") {
    return value;
  }

  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "")
    .trim();
}

export function parseObsidianReferenceNote(
  filePath: string,
  raw: string,
): ParsedReference | null {
  const { frontmatter, body } = splitFrontmatter(raw);
  const metadata = parseFrontmatter(frontmatter);
  const categories = toStringArray(sanitizeWikiValue(metadata.categories));
  const type = String(metadata.type ?? "").trim();

  const kind: ImportKind = categories.includes("People")
    ? "person"
    : categories.includes("Books") || type === "book"
      ? "book"
      : categories.includes("Movies") || type === "movie"
        ? "movie"
        : "reference";

  if (!["person", "book", "movie"].includes(kind)) {
    return null;
  }

  const title = getTitle(filePath, body);
  const bodyText =
    kind === "person"
      ? extractPersonBody(body)
      : [
          extractSection(body, "Summary"),
          extractSection(body, "Key Takeaways"),
          extractSection(body, "Notes"),
        ]
          .filter(Boolean)
          .join("\n\n")
          .trim();

  const cleanedMetadata = buildMetadata(kind, metadata);
  const tags = [
    kind,
    ...toStringArray(sanitizeWikiValue(metadata.genre)),
    ...toStringArray(sanitizeWikiValue(metadata.status)),
  ].filter(Boolean);

  return {
    kind,
    title,
    sourcePath: filePath,
    body: bodyText || title,
    url:
      typeof cleanedMetadata.url === "string" ? cleanedMetadata.url : undefined,
    tags: [...new Set(tags)],
    metadata: cleanedMetadata,
  };
}

async function main() {
  const referencesDir = path.join(defaultVault, "References");
  const files = fs
    .readdirSync(referencesDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(referencesDir, file));

  const parsed = files
    .map((file) =>
      parseObsidianReferenceNote(file, fs.readFileSync(file, "utf8")),
    )
    .filter((item): item is ParsedReference => Boolean(item));

  let people = 0;
  let books = 0;
  let movies = 0;

  for (const item of parsed) {
    if (item.kind === "person") {
      await upsertPerson(item);
      people += 1;
      continue;
    }

    await prisma.reference.upsert({
      where: { sourcePath: item.sourcePath },
      update: {
        title: item.title,
        kind: item.kind,
        body: item.body,
        url: item.url ?? null,
        tags: item.tags,
        metadata: item.metadata as Prisma.InputJsonObject,
        source: "obsidian",
      },
      create: {
        title: item.title,
        kind: item.kind,
        body: item.body,
        url: item.url ?? null,
        tags: item.tags,
        metadata: item.metadata as Prisma.InputJsonObject,
        sourcePath: item.sourcePath,
        source: "obsidian",
      },
    });

    if (item.kind === "book") books += 1;
    if (item.kind === "movie") movies += 1;
  }

  console.log(`Imported ${people} people, ${books} books, ${movies} movies.`);
}

async function upsertPerson(item: ParsedReference) {
  const metadata = item.metadata;
  const existing = await prisma.person.findFirst({
    where: { name: item.title },
    select: {
      id: true,
      relationshipType: true,
      company: true,
      notesMd: true,
    },
  });

  const organization = toStringArray(metadata.org).join(", ");
  const notes = item.body.trim();

  const createData = {
    name: item.title,
    relationshipType: "reference",
    company: organization || null,
    notesMd: notes || null,
    status: "active" as const,
  };

  if (existing) {
    await prisma.person.update({
      where: { id: existing.id },
      data: {
        relationshipType: existing.relationshipType ?? "reference",
        company: organization || existing.company,
        notesMd: notes || existing.notesMd,
        status: "active",
      },
    });
  } else {
    await prisma.person.create({ data: createData });
  }
}

function splitFrontmatter(raw: string) {
  if (!raw.startsWith("---")) return { frontmatter: "", body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: "", body: raw };
  return {
    frontmatter: raw.slice(3, end).trim(),
    body: raw.slice(end + 4).trim(),
  };
}

function parseFrontmatter(frontmatter: string) {
  const result: Record<string, unknown> = {};
  const lines = frontmatter.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    const value = match[2] ?? "";
    const list: string[] = [];

    let cursor = index + 1;
    while (cursor < lines.length) {
      const listMatch = lines[cursor].match(/^\s*-\s*(.*)$/);
      if (!listMatch) break;
      list.push(listMatch[1].trim());
      cursor += 1;
    }

    if (list.length > 0) {
      result[key] = list;
      index = cursor - 1;
    } else {
      result[key] = parseScalar(value);
    }
  }

  return result;
}

function parseScalar(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "[]") return [];
  if (/^\[.*\]$/.test(trimmed) && !trimmed.startsWith("[[")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, "");
}

function buildMetadata(kind: ImportKind, metadata: Record<string, unknown>) {
  const keys =
    kind === "book"
      ? [
          "author",
          "genre",
          "rating",
          "status",
          "cover",
          "published",
          "pages",
          "url",
          "started",
          "finished",
        ]
      : kind === "movie"
        ? [
            "year",
            "director",
            "cast",
            "genre",
            "rating",
            "status",
            "watched",
            "imdb",
          ]
        : ["birthday", "org"];

  return Object.fromEntries(
    keys
      .map((key) => [key, sanitizeWikiValue(metadata[key])] as const)
      .filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== "" && value !== null && value !== undefined;
      }),
  );
}

function getTitle(filePath: string, body: string) {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path.basename(filePath, ".md");
}

function extractSection(body: string, title: string) {
  const pattern = new RegExp(
    `^## ${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=^## |$)`,
    "m",
  );
  const match = body.match(pattern)?.[1]?.trim() ?? "";
  return stripObsidianBlocks(match);
}

function extractPersonBody(body: string) {
  return stripObsidianBlocks(body.replace(/^## Meetings[\s\S]*$/m, "").trim());
}

function stripObsidianBlocks(value: string) {
  return value
    .replace(/```(?:button|base)[\s\S]*?```/g, "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .trim();
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
