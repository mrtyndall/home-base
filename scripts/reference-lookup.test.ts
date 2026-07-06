import assert from "node:assert/strict";
import fs from "node:fs";

const lookup = fs.readFileSync("src/lib/reference-lookup.ts", "utf8");
const databasePage = fs.readFileSync(
  "src/app/ideas/[database]/page.tsx",
  "utf8",
);
const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const settingsPage = fs.readFileSync("src/app/settings/page.tsx", "utf8");

assert.ok(
  lookup.includes("openlibrary.org/search.json"),
  "Book lookup should use Open Library search.",
);
assert.ok(
  lookup.includes("cover_i") && lookup.includes("covers.openlibrary.org"),
  "Book lookup should preserve Open Library cover images.",
);
assert.ok(
  lookup.includes("BOOKLORE_BASE_URL") &&
    lookup.includes("BOOKLORE_TOKEN") &&
    lookup.includes("/api/v1/books"),
  "Book lookup should be ready to join against the configured BookLore instance.",
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
assert.ok(
  settingsPage.includes("Reference lookup") &&
    settingsPage.includes("Open Library") &&
    settingsPage.includes("BookLore") &&
    settingsPage.includes("TMDB"),
  "Settings should expose the book/movie lookup providers.",
);
assert.ok(
  settingsPage.includes("TMDB_ACCESS_TOKEN") &&
    settingsPage.includes("TMDB_API_KEY"),
  "Settings should show the accepted TMDB env variable names.",
);
