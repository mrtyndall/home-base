import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { ReadLaterList, readLaterHost } from "../src/components/read-later-list";

const formSource = [
  readFileSync("src/components/read-later-form.tsx", "utf8"),
  readFileSync("src/components/read-later-form-client.tsx", "utf8"),
].join("\n");
const listSource = readFileSync("src/components/read-later-list.tsx", "utf8");
const databasePage = readFileSync("src/app/ideas/[database]/page.tsx", "utf8");
const libraryPage = readFileSync("src/app/ideas/page.tsx", "utf8");
const actions = readFileSync("src/app/actions.ts", "utf8");

test("Save link is URL-first and filing remains optional", () => {
  assert.match(formSource, /name="url"/);
  assert.match(formSource, /type="url"/);
  assert.match(formSource, /placeholder="https:\/\//);
  assert.match(formSource, /<AreaPicker/);
  assert.match(formSource, /No filing yet/);
  assert.doesNotMatch(formSource, /name="title"[^>]*required/);
  assert.doesNotMatch(formSource, /name="(?:areaId|projectId)"[^>]*required/);
});

test("queue renders host, saved date, controls, filing path, and long-link wrapping", () => {
  const markup = renderToStaticMarkup(
    createElement(ReadLaterList, {
      status: "unread",
      items: [
        {
          id: "read-1",
          title: null,
          body: "A useful story",
          url: "https://journal.example/a-very-long-story-address-without-breaks",
          readStatus: "unread",
          savedAt: new Date("2026-07-14T12:00:00Z"),
          areaId: "radio",
          projectId: null,
          areaPath: "Hobbies / Ham Radio",
          projectName: null,
        },
      ],
      areas: [
        { id: "hobbies", name: "Hobbies", parentAreaId: null, sortOrder: 0 },
        { id: "radio", name: "Ham Radio", parentAreaId: "hobbies", sortOrder: 0 },
      ],
      projects: [],
    }),
  );

  assert.match(markup, /journal\.example/);
  assert.match(markup, /Jul 14/);
  assert.match(markup, />Open\s/);
  assert.match(markup, /Mark read/);
  assert.match(markup, />File</);
  assert.match(markup, /Hobbies \/ Ham Radio/);
  assert.match(markup, /overflow-wrap:anywhere/);
  assert.equal(readLaterHost("not a URL"), "Saved link");
});

test("Open is an ordinary external link and never submits a read transition", () => {
  assert.match(listSource, /target="_blank"/);
  assert.match(listSource, /rel="noreferrer"/);
  const start = listSource.indexOf("href={url}");
  const openBlock = listSource.slice(start, listSource.indexOf("</a>", start));
  assert.doesNotMatch(openBlock, /setReadLaterStatusAction|name="status"/);
});

test("queue defaults to unread newest-first with explicit status filters", () => {
  assert.match(databasePage, /requestedStatus === "read"/);
  assert.match(databasePage, /requestedStatus === "archived"/);
  assert.match(databasePage, /readStatus: status/);
  assert.match(databasePage, /savedAt: "desc"/);
  assert.match(databasePage, /Unread/);
  assert.match(databasePage, /Archived/);
  assert.match(libraryPage, /href: "\/ideas\/read-later"/);
});

test("all mobile controls preserve 44px targets and actions use shared boundaries", () => {
  for (const [source, label] of [
    [formSource, "save form"],
    [listSource, "queue"],
  ] as const) {
    assert.doesNotMatch(source, /className="[^"]*\bh-(?:8|9|10)\b[^"]*"/, `${label} contains a short fixed-height control`);
    assert.match(source, /min-h-11|h-11/, `${label} needs 44px controls`);
  }
  assert.match(actions, /createReadLater\(/);
  assert.match(actions, /setReadLaterStatus\(/);
  assert.match(actions, /resolveVerifiedDestination/);
  assert.match(actions, /revalidatePath\("\/ideas\/read-later"\)/);
});

test("saving a duplicate without filing preserves its existing destination", () => {
  const saveAction = actions.slice(
    actions.indexOf("export async function saveReadLaterAction"),
    actions.indexOf("export async function setReadLaterStatusAction"),
  );
  assert.match(saveAction, /\.\.\.\(areaId \|\| projectId/);
  assert.doesNotMatch(saveAction, /\{ url, areaId, projectId, source: "manual" \}/);
});
