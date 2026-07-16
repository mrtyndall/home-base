import assert from "node:assert/strict";
import test from "node:test";
import { initialTaskTriagedAt } from "../src/lib/tasks";

const now = new Date("2026-07-16T12:00:00.000Z");

test("only globally unfiled unscheduled tasks start untriaged", () => {
  assert.equal(initialTaskTriagedAt({ title: "Fresh" }, now), null);
  assert.equal(initialTaskTriagedAt({ title: "Dated", dueDate: now }, now), now);
  assert.equal(initialTaskTriagedAt({ title: "Later", someday: true }, now), now);
  assert.equal(initialTaskTriagedAt({ title: "Filed", areaId: "area-1" }, now), now);
  assert.equal(
    initialTaskTriagedAt({ title: "Project", projectId: "project-1" }, now),
    now,
  );
});
