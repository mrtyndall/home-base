import assert from "node:assert/strict";
import {
  formatJournalMarkdown,
  normalizeJournalUpdateInput,
} from "../src/lib/journal";

const entries = [
  {
    entryDate: new Date("2026-07-04T00:00:00.000Z"),
    bodyMd: "Second day\n\n- kept the thread alive",
    tags: ["home", "radio"],
  },
  {
    entryDate: new Date("2026-07-03T00:00:00.000Z"),
    bodyMd: "# First day\n\nA clean start.",
    tags: [],
  },
];

assert.equal(
  formatJournalMarkdown(entries),
  [
    "# Home Base Journal",
    "",
    "## July 3, 2026",
    "",
    "# First day",
    "",
    "A clean start.",
    "",
    "---",
    "",
    "## July 4, 2026",
    "",
    "Second day",
    "",
    "- kept the thread alive",
    "",
    "_Tags: home, radio_",
    "",
  ].join("\n"),
);

assert.deepEqual(
  normalizeJournalUpdateInput({
    bodyMd: "  ## sharpened thought\n\nstill true  ",
    entryDate: "2026-07-04",
    tagsText: "home, radio, home",
  }),
  {
    bodyMd: "## sharpened thought\n\nstill true",
    entryDate: new Date("2026-07-04T00:00:00.000Z"),
    tags: ["home", "radio"],
  },
);

assert.equal(
  normalizeJournalUpdateInput({
    bodyMd: "   ",
    entryDate: "2026-07-04",
    tagsText: "",
  }),
  null,
);
