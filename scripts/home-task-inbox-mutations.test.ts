import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginInboxAssignment,
  beginInboxRemoval,
  commitInboxMutation,
  createHomeTaskInboxState,
  reconcileHomeTaskInbox,
  rollbackInboxMutation,
  undoInboxRemoval,
} from "../src/lib/home-task-inbox-state";

const rows = [
  { id: "task-1", isNew: true, path: "Inbox" },
  { id: "task-2", isNew: false, path: "Personal" },
];

const state = createHomeTaskInboxState({ rows, totalCount: 7, newCount: 3 });
const assignment = { areaId: "area-1", projectId: "project-1", path: "Hobbies / Ham Radio" };
const today = { dueDate: "2026-07-16", someday: false };

test("assignment keeps the row and clears New optimistically", () => {
  const next = beginInboxAssignment(state, "task-1", assignment, 1);
  assert.equal(next.rows[0]?.isNew, false);
  assert.equal(next.rows[0]?.path, "Hobbies / Ham Radio");
  assert.equal(next.totalCount, 7);
  assert.equal(next.newCount, 2);
  assert.deepEqual(state.rows, rows);
});

test("schedule removes, failure restores, and undo stays triaged", () => {
  const pending = beginInboxRemoval(state, "task-1", { kind: "schedule", ...today }, 1);
  assert.equal(pending.rows.length, 1);
  assert.equal(pending.totalCount, 6);
  assert.equal(pending.newCount, 2);

  const restored = rollbackInboxMutation(pending, "task-1", "schedule", 1);
  assert.equal(restored.rows[0]?.isNew, true);
  assert.equal(restored.totalCount, 7);
  assert.equal(restored.newCount, 3);

  const committed = commitInboxMutation(pending, "task-1", "schedule", 1);
  const undone = undoInboxRemoval(committed, "task-1", "schedule", 2);
  assert.equal(undone.rows[0]?.id, "task-1");
  assert.equal(undone.rows[0]?.isNew, false);
  assert.equal(undone.totalCount, 7);
  assert.equal(undone.newCount, 2);
});

test("failed assignment restores exact counts and retains its Retry payload", () => {
  const payload = { areaId: "area-2", projectId: null, path: "Work / Client" };
  const pending = beginInboxAssignment(state, "task-1", payload, 8);
  const restored = rollbackInboxMutation(pending, "task-1", "location", 8);
  assert.deepEqual(restored.rows, rows);
  assert.equal(restored.totalCount, 7);
  assert.equal(restored.newCount, 3);
  assert.deepEqual(restored.retries["task-1:location"], {
    mutationId: 8,
    payload: { kind: "assignment", ...payload },
  });
});

test("location and schedule operations for one task remain independent", () => {
  const assigned = beginInboxAssignment(state, "task-1", { ...assignment, path: "Work" }, 1);
  const removed = beginInboxRemoval(assigned, "task-1", { kind: "schedule", ...today }, 1);
  const locationCommitted = commitInboxMutation(removed, "task-1", "location", 1);
  const scheduleRolledBack = rollbackInboxMutation(locationCommitted, "task-1", "schedule", 1);
  assert.equal(scheduleRolledBack.rows[0]?.path, "Work");
  assert.equal(scheduleRolledBack.rows[0]?.isNew, false);
  assert.equal(scheduleRolledBack.totalCount, 7);
  assert.equal(scheduleRolledBack.newCount, 2);
});

test("a location failure cannot resurrect a task with a pending schedule", () => {
  const assigned = beginInboxAssignment(state, "task-1", { ...assignment, path: "Work" }, 1);
  const removed = beginInboxRemoval(assigned, "task-1", { kind: "schedule", ...today }, 1);
  const stillRemoved = rollbackInboxMutation(removed, "task-1", "location", 1);
  assert.equal(stillRemoved.rows.some((row) => row.id === "task-1"), false);
  assert.equal(stillRemoved.totalCount, 6);
  assert.equal(stillRemoved.newCount, 2);

  const scheduleFailure = rollbackInboxMutation(stillRemoved, "task-1", "schedule", 1);
  assert.deepEqual(scheduleFailure.rows[0], rows[0]);
  assert.equal(scheduleFailure.totalCount, 7);
  assert.equal(scheduleFailure.newCount, 3);
});

test("stale same-channel responses cannot commit or roll back newer state", () => {
  const first = beginInboxAssignment(state, "task-1", { ...assignment, path: "First" }, 1);
  const second = beginInboxAssignment(first, "task-1", { ...assignment, path: "Second" }, 2);
  assert.equal(commitInboxMutation(second, "task-1", "location", 1).rows[0]?.path, "Second");
  assert.equal(rollbackInboxMutation(second, "task-1", "location", 1).rows[0]?.path, "Second");
  assert.equal(rollbackInboxMutation(second, "task-1", "location", 2).rows[0]?.path, "Inbox");
});

test("server reconciliation preserves pending channels and replaces idle server data", () => {
  const pending = beginInboxAssignment(state, "task-1", { ...assignment, path: "Optimistic" }, 3);
  const ignored = reconcileHomeTaskInbox(pending, {
    rows: [{ id: "task-1", isNew: true, path: "Stale" }], totalCount: 1, newCount: 1,
  });
  assert.equal(ignored.rows[0]?.path, "Optimistic");

  const committed = commitInboxMutation(pending, "task-1", "location", 3);
  const reconciled = reconcileHomeTaskInbox(committed, {
    rows: [{ id: "task-1", isNew: false, path: "Authoritative" }], totalCount: 9, newCount: 4,
  });
  assert.equal(reconciled.rows[0]?.path, "Authoritative");
  assert.equal(reconciled.totalCount, 9);
  assert.equal(reconciled.newCount, 4);
});

test("Someday and completion use the same exact removal accounting", () => {
  for (const kind of ["someday", "complete"] as const) {
    const payload = kind === "someday"
      ? { kind, dueDate: null, someday: true } as const
      : { kind } as const;
    const next = beginInboxRemoval(state, "task-1", payload, 1);
    assert.equal(next.totalCount, 6);
    assert.equal(next.newCount, 2);
    assert.equal(next.rows.some((row) => row.id === "task-1"), false);
  }
});

test("schedule rollback retains the exact Retry payload", () => {
  const pending = beginInboxRemoval(state, "task-1", { kind: "schedule", ...today }, 4);
  const failed = rollbackInboxMutation(pending, "task-1", "schedule", 4);
  assert.deepEqual(failed.retries["task-1:schedule"], {
    mutationId: 4,
    payload: { kind: "schedule", ...today },
  });
});

test("different-task optimistic mutations compose exact count deltas", () => {
  const firstRemoved = beginInboxRemoval(state, "task-1", { kind: "schedule", ...today }, 1);
  const bothRemoved = beginInboxRemoval(firstRemoved, "task-2", { kind: "complete" }, 1);
  assert.equal(bothRemoved.totalCount, 5);
  assert.equal(bothRemoved.newCount, 2);

  const firstFailed = rollbackInboxMutation(bothRemoved, "task-1", "schedule", 1);
  assert.equal(firstFailed.totalCount, 6);
  assert.equal(firstFailed.newCount, 3);
  assert.deepEqual(firstFailed.rows.map((row) => row.id), ["task-1"]);

  const secondFailed = rollbackInboxMutation(firstFailed, "task-2", "location", 1);
  assert.equal(secondFailed.totalCount, 7);
  assert.equal(secondFailed.newCount, 3);
  assert.deepEqual(secondFailed.rows.map((row) => row.id), ["task-1", "task-2"]);
});

test("a concurrent assignment and another-row removal keep exact New count", () => {
  const assigned = beginInboxAssignment(state, "task-1", assignment, 1);
  const removed = beginInboxRemoval(assigned, "task-2", { kind: "complete" }, 1);
  const removalFailed = rollbackInboxMutation(removed, "task-2", "location", 1);
  assert.equal(removalFailed.totalCount, 7);
  assert.equal(removalFailed.newCount, 2);
  assert.equal(removalFailed.rows[0]?.path, assignment.path);
});

test("failed undo removes the optimistically restored row and preserves removed counts", () => {
  const pending = beginInboxRemoval(state, "task-1", { kind: "schedule", ...today }, 1);
  const committed = commitInboxMutation(pending, "task-1", "schedule", 1);
  const undoing = undoInboxRemoval(committed, "task-1", "schedule", 2);
  const failed = rollbackInboxMutation(undoing, "task-1", "schedule", 2);
  assert.equal(failed.rows.some((row) => row.id === "task-1"), false);
  assert.equal(failed.totalCount, 6);
  assert.equal(failed.newCount, 2);
  const retrying = undoInboxRemoval(failed, "task-1", "schedule", 3);
  assert.equal(retrying.rows.some((row) => row.id === "task-1"), true);
  assert.equal(retrying.totalCount, 7);
  assert.equal(retrying.newCount, 2);
});
