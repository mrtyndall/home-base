import assert from "node:assert/strict";
import fs from "node:fs";

const script = fs.readFileSync("scripts/enrich-reference-artwork.ts", "utf8");
const nextConfig = fs.readFileSync("next.config.ts", "utf8");
const databasePage = fs.readFileSync(
  "src/app/ideas/[database]/page.tsx",
  "utf8",
);
const referencePage = fs.readFileSync(
  "src/app/references/[referenceId]/page.tsx",
  "utf8",
);

assert.ok(
  script.includes("metadata.coverUrl") &&
    script.includes("if (metadata.coverUrl) continue"),
  "Artwork enrichment should only fill missing coverUrl values.",
);

assert.ok(
  script.includes("parseObsidianReferenceNote") &&
    script.includes("stringValue(obsidian?.metadata.cover)") &&
    script.includes('artworkSource: "obsidian"'),
  "Artwork enrichment should reuse Obsidian book cover URLs.",
);

assert.ok(
  script.includes("v3.sg.media-imdb.com/suggestion") &&
    script.includes("imdbId") &&
    script.includes('artworkSource: "imdb-suggestion"'),
  "Artwork enrichment should scrape movie posters from existing IMDb IDs.",
);

assert.ok(
  databasePage.includes("record.coverUrl") &&
    databasePage.includes("record.cover") &&
    referencePage.includes("record.coverUrl") &&
    referencePage.includes("record.cover"),
  "Reference list and detail views should accept both coverUrl and Obsidian cover metadata.",
);

assert.ok(
  nextConfig.includes('hostname: "books.google.com"') &&
    nextConfig.includes('hostname: "images-na.ssl-images-amazon.com"') &&
    nextConfig.includes('hostname: "m.media-amazon.com"'),
  "Next Image should allow Obsidian and scraped reference artwork hosts.",
);
