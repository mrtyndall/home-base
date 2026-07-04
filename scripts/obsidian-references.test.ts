import assert from "node:assert/strict";
import {
  parseObsidianReferenceNote,
  sanitizeWikiValue,
} from "./import-obsidian-references";

const book = parseObsidianReferenceNote(
  "/vault/References/The Creative Act.md",
  `---
categories:
  - "[[Books]]"
type: book
author: "[[Rick Rubin]]"
genre:
  - non-fiction
rating: 9
status: finished
pages: 433
url: http://example.com/book
created: 2026-01-26
---

# The Creative Act

## Summary

A book about making things.

## Notes

Keep it close.
`,
);

assert.equal(book?.kind, "book");
assert.equal(book?.title, "The Creative Act");
assert.equal(book?.metadata.author, "Rick Rubin");
assert.equal(book?.metadata.rating, 9);
assert.equal(book?.metadata.status, "finished");
assert.equal(book?.metadata.pages, 433);
assert.equal(book?.body, "A book about making things.\n\nKeep it close.");

const movie = parseObsidianReferenceNote(
  "/vault/References/Fargo.md",
  `---
categories:
  - "[[Movies]]"
type: movie
year: 1996
director: "[[Joel Coen]]"
cast:
  - "[[Frances McDormand]]"
rating: 4
status: watched
watched: 2023-12-30
imdb: https://imdb.com/title/tt0116282
created: 2026-01-26
---

# Fargo

## Summary

Crime falls apart in Minnesota.
`,
);

assert.equal(movie?.kind, "movie");
assert.equal(movie?.title, "Fargo");
assert.equal(movie?.metadata.director, "Joel Coen");
assert.deepEqual(movie?.metadata.cast, ["Frances McDormand"]);
assert.equal(movie?.metadata.year, 1996);

const person = parseObsidianReferenceNote(
  "/vault/References/Erik Button.md",
  `---
categories:
  - "[[People]]"
tags:
  - people
birthday:
org: []
created: 2026-01-26
---

## Meetings
`,
);

assert.equal(person?.kind, "person");
assert.equal(person?.title, "Erik Button");

assert.equal(sanitizeWikiValue("[[Steven Spielberg]]"), "Steven Spielberg");
assert.deepEqual(sanitizeWikiValue(["[[Amy Alton]]", "[[Joseph Alton]]"]), [
  "Amy Alton",
  "Joseph Alton",
]);
