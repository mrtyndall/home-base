import assert from "node:assert/strict";
import fs from "node:fs";

const editor = fs.readFileSync("src/components/journal-entry-editor.tsx", "utf8");
const libraryPage = fs.readFileSync("src/app/ideas/page.tsx", "utf8");

assert.ok(
  !editor.includes("MarkdownPreview"),
  "Journal edit mode should not render a live preview panel.",
);

assert.ok(
  !editor.includes("Preview"),
  "Journal edit mode should not label a redundant preview surface.",
);

assert.ok(
  editor.includes('name="bodyMd"') && editor.includes("<textarea"),
  "Journal edit mode should expose the Markdown source in a textarea.",
);

assert.ok(
  libraryPage.includes("<MarkdownPreview") &&
    libraryPage.includes("body={entry.bodyMd}"),
  "Saved journal entries should render Markdown on the Library page.",
);
