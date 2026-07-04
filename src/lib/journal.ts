import { dateOnlyFromString } from "@/lib/dates";

export type JournalMarkdownEntry = {
  entryDate: Date;
  bodyMd: string;
  tags: string[];
};

export function formatJournalMarkdown(entries: JournalMarkdownEntry[]) {
  const lines = ["# Home Base Journal", ""];

  const sortedEntries = [...entries].sort(
    (a, b) => a.entryDate.getTime() - b.entryDate.getTime(),
  );

  sortedEntries.forEach((entry, index) => {
    if (index > 0) {
      lines.push("---", "");
    }

    lines.push(`## ${formatJournalExportDate(entry.entryDate)}`, "");
    lines.push(entry.bodyMd.trim(), "");

    if (entry.tags.length > 0) {
      lines.push(`_Tags: ${entry.tags.join(", ")}_`, "");
    }
  });

  return lines.join("\n");
}

function formatJournalExportDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function normalizeJournalUpdateInput(input: {
  bodyMd: string;
  entryDate: string;
  tagsText: string;
}) {
  const bodyMd = input.bodyMd.trim();
  if (!bodyMd) return null;

  const entryDate = dateOnlyFromString(input.entryDate);
  if (!entryDate) return null;

  const seenTags = new Set<string>();
  const tags = input.tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag || seenTags.has(tag)) return false;
      seenTags.add(tag);
      return true;
    });

  return { bodyMd, entryDate, tags };
}
