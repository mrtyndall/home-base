import assert from "node:assert/strict";
import test from "node:test";

import {
  beginOptimisticOperation,
  displayTaskSchedule,
  settleOptimisticOperation,
  taskDatePresets,
} from "../src/lib/task-quick-edit";

function presetDate(today: string, key: string) {
  const preset = taskDatePresets(today).find((candidate) => candidate.key === key);
  assert.ok(preset, `Expected ${key} preset`);
  return preset.value.dueDate;
}

test("date presets use the server-supplied Friday without timezone conversion", () => {
  assert.equal(presetDate("2026-07-17", "today"), "2026-07-17");
  assert.equal(presetDate("2026-07-17", "tomorrow"), "2026-07-18");
  assert.equal(presetDate("2026-07-17", "weekend"), "2026-07-18");
  assert.equal(presetDate("2026-07-17", "next-week"), "2026-07-20");
});

test("This weekend is today when the server-supplied date is Saturday", () => {
  assert.equal(presetDate("2026-07-18", "weekend"), "2026-07-18");
});

test("Next week crosses from Sunday to the following Monday", () => {
  assert.equal(presetDate("2026-07-19", "next-week"), "2026-07-20");
});

test("Next week means the following Monday when today is Monday", () => {
  assert.equal(presetDate("2026-07-20", "next-week"), "2026-07-27");
});

test("schedule display distinguishes a date, Someday, and no date", () => {
  assert.equal(
    displayTaskSchedule({ dueDate: "2026-07-14", someday: false }),
    "Jul 14",
  );
  assert.equal(displayTaskSchedule({ dueDate: null, someday: true }), "Someday");
  assert.equal(displayTaskSchedule({ dueDate: null, someday: false }), "No date");
  assert.equal(displayTaskSchedule(null), "No date");
});

test("a failed optimistic operation rolls back and preserves the exact retry payload", () => {
  const retryPayload = { dueDate: "2026-07-18", someday: false };
  const pending = beginOptimisticOperation(
    { dueDate: null, someday: false },
    { dueDate: "2026-07-18", someday: false },
    retryPayload,
    "schedule-1",
  );

  assert.deepEqual(pending.value, { dueDate: "2026-07-18", someday: false });
  assert.equal(pending.pending, true);

  const failed = settleOptimisticOperation(pending, {
    operationToken: "schedule-1",
    ok: false,
    error: "Couldn’t update task",
  });

  assert.deepEqual(failed.value, { dueDate: null, someday: false });
  assert.equal(failed.pending, false);
  assert.equal(failed.error, "Couldn’t update task");
  assert.equal(failed.retryPayload, retryPayload);
});

test("a successful optimistic operation accepts an authoritative value", () => {
  const pending = beginOptimisticOperation(
    "Inbox",
    "Draft destination",
    { areaId: "area-1", projectId: null },
    "assignment-1",
  );

  const succeeded = settleOptimisticOperation(pending, {
    operationToken: "assignment-1",
    ok: true,
    value: "Home / Studio",
  });

  assert.equal(succeeded.value, "Home / Studio");
  assert.equal(succeeded.pending, false);
  assert.equal(succeeded.error, null);
  assert.equal(succeeded.retryPayload, null);
});

test("a stale response cannot overwrite a newer optimistic choice", () => {
  const first = beginOptimisticOperation(
    "Inbox",
    "Home",
    { areaId: "home", projectId: null },
    "assignment-1",
  );
  const second = beginOptimisticOperation(
    first.value,
    "Home / Studio",
    { areaId: "studio", projectId: null },
    "assignment-2",
  );

  const afterStaleFailure = settleOptimisticOperation(second, {
    operationToken: "assignment-1",
    ok: false,
    error: "Couldn’t update task",
  });
  const afterStaleSuccess = settleOptimisticOperation(second, {
    operationToken: "assignment-1",
    ok: true,
    value: "Home",
  });

  assert.equal(afterStaleFailure, second);
  assert.equal(afterStaleSuccess, second);
  assert.equal(second.value, "Home / Studio");
  assert.equal(second.pending, true);
});
