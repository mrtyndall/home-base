import assert from "node:assert/strict";
import fs from "node:fs";

const libraryPage = fs.readFileSync("src/app/ideas/page.tsx", "utf8");
const databasePage = fs.readFileSync(
  "src/app/ideas/[database]/page.tsx",
  "utf8",
);
const referenceFilters = fs.readFileSync(
  "src/app/ideas/[database]/reference-filters.tsx",
  "utf8",
);
const referencePage = fs.readFileSync(
  "src/app/references/[referenceId]/page.tsx",
  "utf8",
);
const mentions = fs.readFileSync("src/lib/reference-mentions.ts", "utf8");
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const searchPage = fs.readFileSync("src/app/search/page.tsx", "utf8");

assert.ok(
  libraryPage.includes('href: "/ideas/books"') &&
    libraryPage.includes('href: "/ideas/movies"') &&
    libraryPage.includes('href: "/ideas/references"') &&
    libraryPage.includes('href: "/ideas/people"'),
  "Reference database cards should open dedicated database pages.",
);
assert.ok(
  databasePage.includes("searchParams") &&
    databasePage.includes("metadataStatus") &&
    databasePage.includes("metadataRating"),
  "Book/movie database pages should expose metadata filters and sorting.",
);
assert.ok(
  referenceFilters.includes('"use client"') &&
    referenceFilters.includes("requestSubmit") &&
    !referenceFilters.includes("Apply filters"),
  "Book/movie metadata filters should apply live when changed.",
);
assert.ok(
  databasePage.includes("Add a book") &&
    databasePage.includes("Add a movie") &&
    databasePage.includes("open={Boolean(query)}") &&
    !databasePage.includes("Source: {candidateSourceLabel"),
  "Book/movie lookup should live behind an add disclosure and use concise source labels.",
);
assert.ok(
  referenceFilters.includes("StatusChip") &&
    referenceFilters.includes("buildHref") &&
    referenceFilters.includes("statusCounts") &&
    referenceFilters.includes("Sort: Title"),
  "Book/movie database filters should use status chips with live pill selects.",
);
assert.ok(
  databasePage.includes("href={`/references/${reference.id}`}"),
  "Database rows should open a reference detail page.",
);
assert.ok(
  databasePage.includes("metadataCoverUrl") &&
    databasePage.includes('alt=""') &&
    databasePage.includes("grid grid-cols-3") &&
    referencePage.includes("metadataCoverUrl"),
  "Book references should render covers in rows and movies should render a poster grid.",
);
assert.ok(
  referencePage.includes("All metadata") &&
    referencePage.includes("kindLabel(reference.kind)") &&
    referencePage.includes("backHref"),
  "References need their own detail pages.",
);
assert.ok(
  schema.includes("model ReferenceSnippet") &&
    schema.includes("reference_snippets"),
  "BookLore highlights and notes should live as durable reference snippets.",
);
assert.ok(
  referencePage.includes("Highlights & notes") &&
    referencePage.includes("syncBookLoreSnippetsAction") &&
    referencePage.includes("setReferenceSnippetStarred"),
  "Reference detail pages should surface and manage synced highlights and notes.",
);
assert.ok(
  searchPage.includes("referenceSnippet.findMany") &&
    searchPage.includes("type: \"Highlight\""),
  "BookLore highlights should be searchable as first-class reference content.",
);
assert.ok(
  mentions.includes("return `/references/${targetId}`"),
  "Reference hotlinks should open the stable reference detail page.",
);
