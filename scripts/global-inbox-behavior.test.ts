import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AreaPicker } from "../src/components/area-picker";
import {
  countGlobalInbox,
  GLOBAL_INBOX_PAGE_SIZE,
  loadGlobalInboxPage,
} from "../src/lib/global-inbox";

type Row = { id: string; name?: string; status?: string; areaId?: string | null };

function fakeInboxClient(projectCount: number, routineCount: number) {
  const projects: Row[] = Array.from({ length: projectCount }, (_, index) => ({
    id: `project-${index + 1}`,
    name: `Project ${index + 1}`,
    status: "active",
    areaId: null,
  }));
  const routines: Row[] = Array.from({ length: routineCount }, (_, index) => ({
    id: `routine-${index + 1}`,
    name: `Routine ${index + 1}`,
    status: "active",
    areaId: null,
  }));
  projects.push(
    { id: "project-completed", name: "Completed", status: "completed", areaId: null },
    { id: "project-filed", name: "Filed", status: "active", areaId: "active" },
  );
  routines.push(
    { id: "routine-paused", name: "Paused", status: "paused", areaId: null },
    { id: "routine-filed", name: "Filed", status: "active", areaId: "active" },
  );
  const rows: Record<string, Row[]> = {
    area: [
      { id: "old", name: "Old parent", status: "retired", areaId: null },
      { id: "active", name: "Active child", status: "active", areaId: null },
    ],
    project: projects,
    routine: routines,
  };
  const eligible = (name: string, args?: { where?: unknown }) => {
    const values = rows[name] ?? [];
    const where = (args?.where ?? {}) as { areaId?: null; status?: string | { in?: string[] } };
    return values.filter((row) => {
      if (where.areaId === null && row.areaId !== null) return false;
      if (typeof where.status === "string" && row.status !== where.status) return false;
      if (typeof where.status === "object" && where.status.in && !where.status.in.includes(row.status ?? "")) return false;
      return true;
    });
  };
  const model = (name: string) => ({
    findMany: async (args: { skip?: number; take?: number; where?: unknown }) => {
      const values = eligible(name, args);
      return values.slice(args?.skip ?? 0, (args?.skip ?? 0) + (args?.take ?? values.length));
    },
    count: async (args: { where?: unknown }) => eligible(name, args).length,
  });
  return {
    area: model("area"), capture: model("capture"), captureReviewProposal: model("captureReviewProposal"),
    scheduledReview: model("scheduledReview"), task: model("task"), project: model("project"),
    routine: model("routine"), idea: model("idea"), reference: model("reference"),
    entityNote: model("entityNote"), entityDoc: model("entityDoc"), document: model("document"),
  };
}

test("31 unfiled Projects are reachable across bounded Inbox pages", async () => {
  const client = fakeInboxClient(31, 0);
  const first = await loadGlobalInboxPage(0, client as never);
  assert.equal(first.projects.length, GLOBAL_INBOX_PAGE_SIZE);
  assert.equal(first.projects[0]?.id, "project-1");
  assert.equal(first.hasNextPage, true);

  const second = await loadGlobalInboxPage(1, client as never);
  assert.deepEqual(second.projects.map((project) => project.id), ["project-31"]);
  assert.equal(second.hasNextPage, false);
  assert.equal(second.hasPreviousPage, true);
});

test("Inbox count includes active unfiled Routines and Projects", async () => {
  const count = await countGlobalInbox(new Date("2026-07-14T12:00:00Z"), fakeInboxClient(31, 2) as never);
  assert.equal(count, 33);
});

test("Area choices retain an inactive ancestor in the full path without making it selectable", () => {
  const markup = renderToStaticMarkup(createElement(AreaPicker, {
    areas: [
      { id: "old", name: "Old parent", parentAreaId: null, sortOrder: 0 },
      { id: "active", name: "Active child", parentAreaId: "old", sortOrder: 0 },
    ],
    selectableAreaIds: ["active"],
  }));
  assert.match(markup, /Old parent \/ Active child/);
  assert.doesNotMatch(markup, /value="old"/);
});
