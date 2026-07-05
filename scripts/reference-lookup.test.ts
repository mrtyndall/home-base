import assert from "node:assert/strict";
import fs from "node:fs";

const lookup = fs.readFileSync("src/lib/reference-lookup.ts", "utf8");
const databasePage = fs.readFileSync(
  "src/app/ideas/[database]/page.tsx",
  "utf8",
);
const actions = fs.readFileSync("src/app/actions.ts", "utf8");

assert.ok(
  lookup.includes("openlibrary.org/search.json"),
  "Book lookup should use Open Library search.",
);
assert.ok(
  lookup.includes("api.themoviedb.org/3/search/movie"),
  "Movie lookup should use TMDB movie search.",
);
assert.ok(
  lookup.includes("TMDB_ACCESS_TOKEN") && lookup.includes("TMDB_API_KEY"),
  "Movie lookup should support configured TMDB credentials without hardcoded secrets.",
);
assert.ok(
  databasePage.includes("lookup") &&
    databasePage.includes("ReferenceLookupResults"),
  "Book/movie database pages should expose lookup-driven quick add.",
);
assert.ok(
  actions.includes("export async function createReferenceFromLookup"),
  "Lookup results need a server action that saves the selected book/movie.",
);
