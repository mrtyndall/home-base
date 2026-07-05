import assert from "node:assert/strict";
import fs from "node:fs";

const libraryPage = fs.readFileSync("src/app/ideas/page.tsx", "utf8");
const databasePage = fs.readFileSync(
  "src/app/ideas/[database]/page.tsx",
  "utf8",
);
const referencePage = fs.readFileSync(
  "src/app/references/[referenceId]/page.tsx",
  "utf8",
);
const mentions = fs.readFileSync("src/lib/reference-mentions.ts", "utf8");

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
  databasePage.includes("href={`/references/${reference.id}`}"),
  "Database rows should open a reference detail page.",
);
assert.ok(
  referencePage.includes("Reference detail") &&
    referencePage.includes("Metadata"),
  "References need their own detail pages.",
);
assert.ok(
  mentions.includes("return `/references/${targetId}`"),
  "Reference hotlinks should open the stable reference detail page.",
);
