import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const presignRoute = fs.readFileSync(
  "src/app/api/documents/presign/route.ts",
  "utf8",
);
const attachmentUpload = fs.readFileSync(
  "src/components/attachment-upload.tsx",
  "utf8",
);
const editor = fs.readFileSync(
  "src/components/journal-entry-editor.tsx",
  "utf8",
);
const libraryPage = fs.readFileSync("src/app/ideas/page.tsx", "utf8");

const entityParentType = schema.match(/enum EntityParentType\s*{([\s\S]*?)}/)?.[1];

assert.ok(
  entityParentType?.includes("journal_entry"),
  "Journal entries should be valid attachment parents.",
);

assert.ok(
  presignRoute.includes('"journal_entry"'),
  "Document presign route should accept journal entry uploads.",
);

assert.ok(
  attachmentUpload.includes('"journal_entry"') &&
    attachmentUpload.includes("accept?: string") &&
    attachmentUpload.includes("accept={accept}"),
  "AttachmentUpload should support journal-entry parents and image-only pickers.",
);

assert.ok(
  editor.includes("AttachmentUpload") &&
    editor.includes('parentType="journal_entry"') &&
    editor.includes('accept="image/*"') &&
    editor.includes("Add photo"),
  "Journal edit mode should expose an explicit photo attachment control.",
);

assert.ok(
  libraryPage.includes("attachmentsByEntry") &&
    libraryPage.includes("isJournalImage") &&
    libraryPage.includes("/api/documents/${attachment.id}/download"),
  "Library journal cards should render attached photos from saved documents.",
);
