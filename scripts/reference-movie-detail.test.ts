import assert from "node:assert/strict";
import fs from "node:fs";

const referencePage = fs.readFileSync(
  "src/app/references/[referenceId]/page.tsx",
  "utf8",
);

assert.ok(
  referencePage.includes("metadataCreator(reference)") &&
    referencePage.includes("metadataYear(reference)") &&
    referencePage.includes("metadataCreator(reference), metadataYear(reference)"),
  "Movie reference hero should render director and year as the byline.",
);

assert.ok(
  referencePage.includes("watchStatus(reference)") &&
    referencePage.includes("watchedAt") &&
    referencePage.includes("watched ${formatShortDate"),
  "Movie reference meta line should render watched/unwatched as a plain fact, using watchedAt when present.",
);

assert.ok(
  referencePage.includes('reference.kind === "movie"') &&
    referencePage.includes('"Synopsis"') &&
    referencePage.includes("metadataCast(reference)"),
  "Movie reference detail should label body copy as Synopsis and render cast when metadata exists.",
);

assert.ok(
  referencePage.includes("sourceUrl(reference)") &&
    referencePage.includes(".imdb") &&
    referencePage.includes("sourceHost(sourceUrl(reference)"),
  "Movie reference source link should fall back to metadata.imdb when reference.url is empty.",
);

assert.ok(
  referencePage.includes('"director"') &&
    referencePage.includes('"cast"') &&
    referencePage.includes('"watchedAt"'),
  "Movie hero metadata keys should be hidden from the raw metadata disclosure.",
);
