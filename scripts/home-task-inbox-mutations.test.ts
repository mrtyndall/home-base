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

test("assignment keeps the row and clears New optimistically", () => {
  const next = beginInboxAssignment(state, "task-1", "Hobbies / Ham Radio", 1);
  assert.equal(next.rows[0]?.isNew, false);
  assert.equal(next.rows[0]?.path, "Hobbies / Ham Radio");
  assert.equal(next.totalCount, 7);
  assert.equal(next.newCount, 2);
  assert.deepEqual(state.rows, rows);
});

test("schedule removes, failure restores, and undo stays triaged", () => {
  const pending = beginInboxRemoval(state, "task-1", "schedule", 1);
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
  const pending = beginInboxAssignment(state, "task-1", "Work / Client", 8);
  const restored = rollbackInboxMutation(pending, "task-1", "location", 8);
  assert.deepEqual(restored.rows, rows);
  assert.equal(restored.totalCount, 7);
  assert.equal(restored.newCount, 3);
  assert.deepEqual(restored.retries["task-1:location"], {
    mutationId: 8,
    kind: "assignment",
    value: "Work / Client",
  });
});

test("location and schedule operations for one task remain independent", () => {
  const assigned = beginInboxAssignment(state, "task-1", "Work", 1);
  const removed = beginInboxRemoval(assigned, "task-1", "schedule", 1);
  const locationCommitted = commitInboxMutation(removed, "task-1", "location", 1);
  const scheduleRolledBack = rollbackInboxMutation(locationCommitted, "task-1", "schedule", 1);
  assert.equal(scheduleRolledBack.rows[0]?.path, "Work");
  assert.equal(scheduleRolledBack.rows[0]?.isNew, false);
  assert.equal(scheduleRolledBack.totalCount, 7);
  assert.equal(scheduleRolledBack.newCount, 2);
});

test("a location failure cannot resurrect a task with a pending schedule", () => {
  const assigned = beginInboxAssignment(state, "task-1", "Work", 1);
  const removed = beginInboxRemoval(assigned, "task-1", "schedule", 1);
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
  const first = beginInboxAssignment(state, "task-1", "First", 1);
  const second = beginInboxAssignment(first, "task-1", "Second", 2);
  assert.equal(commitInboxMutation(second, "task-1", "location", 1).rows[0]?.path, "Second");
  assert.equal(rollbackInboxMutation(second, "task-1", "location", 1).rows[0]?.path, "Second");
  assert.equal(rollbackInboxMutation(second, "task-1", "location", 2).rows[0]?.path, "Inbox");
});

test("server reconciliation preserves pending channels and replaces idle server data", () => {
  const pending = beginInboxAssignment(state, "task-1", "Optimistic", 3);
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
    const next = beginInboxRemoval(state, "task-1", kind, 1);
    assert.equal(next.totalCount, 6);
    assert.equal(next.newCount, 2);
    assert.equal(next.rows.some((row) => row.id === "task-1"), false);
  }
});
