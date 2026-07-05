import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const mentionLib = fs.readFileSync("src/lib/reference-mentions.ts", "utf8");
const textarea = fs.readFileSync("src/components/mention-textarea.tsx", "utf8");
const picker = fs.readFileSync(
  "src/app/api/reference-mentions/search/route.ts",
  "utf8",
);
const peoplePage = fs.readFileSync(
  "src/app/people/[personId]/page.tsx",
  "utf8",
);
const meetingPage = fs.readFileSync(
  "src/app/calendar-events/[eventId]/page.tsx",
  "utf8",
);

assert.ok(
  schema.includes("@@unique([sourceType, sourceId, targetType, targetId])"),
  "Reference mentions should be unique by stable entity id, not display label.",
);
assert.ok(
  textarea.includes("@[[${item.targetType}:${item.id}|${item.label}]]"),
  "Mention picker should insert an Obsidian-style token with a stable id.",
);
assert.ok(
  mentionLib.includes("parseExplicitMentionTokens"),
  "Mention resolver should read stable wikilink tokens.",
);
assert.ok(
  picker.includes('targetType: "calendar_event"'),
  "Mention picker should include calendar events as linkable targets.",
);
assert.ok(
  peoplePage.includes("Mentioned here"),
  "Person page should show note/reference/meeting history.",
);
assert.ok(
  meetingPage.includes("Linked notes"),
  "Calendar event page should show notes linked to the meeting.",
);
