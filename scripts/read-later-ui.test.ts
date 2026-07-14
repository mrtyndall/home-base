import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { ReadLaterList, readLaterHost } from "../src/components/read-later-list";
import {
  ReadLaterItemActionControls,
  ReadLaterMutationError,
} from "../src/components/read-later-item-actions";

const formSource = [
  readFileSync("src/components/read-later-form.tsx", "utf8"),
  readFileSync("src/components/read-later-form-client.tsx", "utf8"),
].join("\n");
const listSource = readFileSync("src/components/read-later-list.tsx", "utf8");
const databasePage = readFileSync("src/app/ideas/[database]/page.tsx", "utf8");
const libraryPage = readFileSync("src/app/ideas/page.tsx", "utf8");

test("Save link is URL-first and filing remains optional", () => {
  assert.match(formSource, /name="url"/);
  assert.match(formSource, /type="url"/);
  assert.match(formSource, /placeholder="https:\/\//);
  assert.match(formSource, /<AreaPicker/);
  assert.match(formSource, /value="unfiled">No filing/);
  assert.doesNotMatch(formSource, /name="title"[^>]*required/);
  assert.match(formSource, /value="unchanged"/);
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
          filingPath: "Hobbies / Ham Radio",
        },
      ],
      areaOptions: [
        { id: "hobbies", name: "Hobbies", path: "Hobbies", depth: 0 },
        { id: "radio", name: "Ham Radio", path: "Hobbies / Ham Radio", depth: 1 },
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
  const markup = renderToStaticMarkup(createElement(ReadLaterItemActionControls, {
    url: "https://example.com/story",
    readStatus: "unread",
    currentAreaId: null,
    currentProjectId: null,
    areaOptions: [],
    projects: [],
    pendingAction: null,
    error: null,
    onStatus: () => assert.fail("rendering Open must not change status"),
    onFile: () => assert.fail("rendering Open must not file"),
  }));
  assert.match(markup, /href="https:\/\/example\.com\/story"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noreferrer"/);
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

test("filing disclosure stays in flow inside the clipped queue card", () => {
  const markup = renderToStaticMarkup(createElement(ReadLaterItemActionControls, {
    url: "https://example.com/story",
    readStatus: "unread",
    currentAreaId: null,
    currentProjectId: null,
    areaOptions: [{ id: "area-1", name: "Area", path: "Root / Area", depth: 1 }],
    projects: [],
    pendingAction: null,
    error: null,
    onStatus: () => undefined,
    onFile: () => undefined,
  }));

  assert.match(markup, /<details[^>]*>[\s\S]*File[\s\S]*<form/);
  assert.doesNotMatch(markup, /(?:sm:)?absolute/);
  assert.match(listSource, /overflow-hidden/);
  for (const label of ["Open", "Mark read", "Archive", "File", "Save filing"]) {
    const tag = markup.match(new RegExp(`<[^>]+class="[^"]*min-h-11[^"]*"[^>]*>[^<]*${label}`));
    assert.ok(tag, `${label} must render with a 44px target`);
  }
  assert.match(markup, /<select[^>]*class="[^"]*min-h-11/);
});

test("pending item actions disable competing mutations and errors are announced", () => {
  const markup = renderToStaticMarkup(createElement(ReadLaterItemActionControls, {
    url: "https://example.com/story",
    readStatus: "unread",
    currentAreaId: null,
    currentProjectId: null,
    areaOptions: [],
    projects: [],
    pendingAction: "status",
    error: null,
    onStatus: () => undefined,
    onFile: () => undefined,
  }));
  assert.ok((markup.match(/disabled=""/g) ?? []).length >= 3);

  const errorMarkup = renderToStaticMarkup(createElement(ReadLaterMutationError, {
    error: "Could not update this Read Later item. Try again.",
  }));
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /aria-live="polite"/);
  assert.match(errorMarkup, /Could not update/);
});
