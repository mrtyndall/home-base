import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LatestRequestCoordinator,
  MutationChannel,
  readRecentDestinationIds,
  runLatestRequest,
  writeRecentDestinationId,
} from "../src/lib/task-quick-edit-coordinator";
import { TaskQuickEditMutationOwner } from "../src/lib/task-quick-edit-mutation-owner";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("same-channel writes serialize and only the latest operation controls visible state", async () => {
  const calls: string[] = [];
  const first = deferred<string>();
  const second = deferred<string>();
  const channel = new MutationChannel("initial", (a, b) => a === b);
  const one = channel.mutate("one", async () => { calls.push("one"); return first.promise; });
  const two = channel.mutate("two", async () => { calls.push("two"); return second.promise; });
  await Promise.resolve();
  assert.deepEqual(calls, ["one"]);
  assert.equal(channel.snapshot().value, "two");
  first.resolve("ONE");
  await one;
  await Promise.resolve();
  assert.deepEqual(calls, ["one", "two"]);
  assert.equal(channel.snapshot().value, "two");
  second.resolve("TWO");
  await Promise.all([one, two]);
  assert.equal(channel.snapshot().value, "TWO");
});

test("channels never suppress one another and a new same-channel write clears older Undo", async () => {
  const schedule = new MutationChannel("none", (a, b) => a === b);
  const location = new MutationChannel("Inbox", (a, b) => a === b);
  await schedule.mutate("Today", async (value) => value);
  assert.ok(schedule.snapshot().undo);
  const pending = deferred<string>();
  const nextSchedule = schedule.mutate("Tomorrow", () => pending.promise);
  assert.equal(schedule.snapshot().undo, null);
  await location.mutate("Work", async (value) => value);
  assert.equal(location.snapshot().value, "Work");
  assert.equal(schedule.snapshot().value, "Tomorrow");
  pending.resolve("Tomorrow");
  await nextSchedule;
});

test("Undo queues through the channel and restores the exact committed prior value", async () => {
  const channel = new MutationChannel("Inbox", (a, b) => a === b);
  await channel.mutate("Work", async () => "Work authoritative");
  const writes: string[] = [];
  await channel.undo(async (value) => { writes.push(value); return value; });
  assert.deepEqual(writes, ["Inbox"]);
  assert.equal(channel.snapshot().value, "Inbox");
});

test("failure rolls back to committed state and Retry preserves the requested value", async () => {
  const channel = new MutationChannel("Inbox", (a, b) => a === b);
  await channel.mutate("Work", async () => { throw new Error("no"); });
  assert.equal(channel.snapshot().value, "Inbox");
  assert.equal(channel.snapshot().retryValue, "Work");
  await channel.retry(async (value) => value);
  assert.equal(channel.snapshot().value, "Work");
});

test("changed server props reconcile only when optimistic work is idle", async () => {
  const pending = deferred<string>();
  const channel = new MutationChannel("old", (a, b) => a === b);
  const mutation = channel.mutate("optimistic", () => pending.promise);
  channel.reconcile("stale prop");
  assert.equal(channel.snapshot().value, "optimistic");
  pending.resolve("authoritative");
  await mutation;
  channel.reconcile("fresh prop");
  assert.equal(channel.snapshot().value, "fresh prop");
});

test("same-value prop reconcile preserves Undo while refreshing the authoritative label", async () => {
  type Location = { id: string; label: string };
  const channel = new MutationChannel<Location>(
    { id: "inbox", label: "Inbox" },
    (left, right) => left.id === right.id,
  );
  await channel.mutate({ id: "work", label: "Work" }, async (value) => value);
  channel.reconcile({ id: "work", label: "Work / Client" });
  assert.equal(channel.snapshot().value.label, "Work / Client");
  assert.ok(channel.snapshot().undo);
});

test("failed schedule keeps Retry when an unrelated location refresh causes same-value reconciliation", async () => {
  const schedule = new MutationChannel("No date", (left, right) => left === right);
  const location = new MutationChannel("Inbox", (left, right) => left === right);
  await schedule.mutate("Today", async () => { throw new Error("offline"); });
  location.reconcile("Work");
  schedule.reconcile("No date");
  assert.equal(schedule.snapshot().error, "Couldn’t update task");
  assert.equal(schedule.snapshot().retryValue, "Today");
});

test("genuinely different external values clear stale recovery state", async () => {
  const channel = new MutationChannel("No date", (left, right) => left === right);
  await channel.mutate("Today", async () => { throw new Error("offline"); });
  channel.reconcile("Tomorrow");
  assert.equal(channel.snapshot().value, "Tomorrow");
  assert.equal(channel.snapshot().error, null);
  assert.equal(channel.snapshot().retryValue, null);
  assert.equal(channel.snapshot().undo, null);
});

test("request coordinator aborts old work and rejects stale success and failure", () => {
  const requests = new LatestRequestCoordinator();
  const first = requests.begin();
  const second = requests.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  requests.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(second.isCurrent(), false);
});

test("the component's latest-request runner drops stale data and stale errors", async () => {
  const coordinator = new LatestRequestCoordinator();
  const stale = deferred<string>();
  const current = deferred<string>();
  const first = runLatestRequest(coordinator, () => stale.promise);
  const second = runLatestRequest(coordinator, () => current.promise);
  stale.reject(new Error("stale failure"));
  current.resolve("current data");
  assert.equal(await first, undefined);
  assert.equal(await second, "current data");
});

test("recent destination storage failures are contained", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readRecentDestinationIds(broken), []);
  assert.deepEqual(writeRecentDestinationId(broken, "area-1"), []);
});

test("an external mutation owner retains Retry and Undo after the visual client detaches", async () => {
  let fail = true;
  const events: string[] = [];
  const owner = new TaskQuickEditMutationOwner(
    "none",
    "Inbox",
    (left, right) => left === right,
    (left, right) => left === right,
  );
  owner.bind({
    taskId: "task-1",
    writeSchedule: async (value) => {
      if (fail) throw new Error("offline");
      return value;
    },
    writeLocation: async (value) => value,
    onMutation: (event) => events.push(`${event.channel}:${event.phase}`),
  });

  await owner.mutateSchedule("Today");
  assert.equal(owner.scheduleChannel.snapshot().retryValue, "Today");

  // The row UI is now absent; Retry and Undo remain commands on the external owner.
  fail = false;
  await owner.retrySchedule();
  assert.ok(owner.scheduleChannel.snapshot().undo);
  fail = true;
  await owner.undoSchedule();
  assert.equal(owner.scheduleChannel.snapshot().value, "Today");
  assert.equal(owner.scheduleChannel.snapshot().retryValue, "none");
  fail = false;
  await owner.retrySchedule();
  assert.equal(owner.scheduleChannel.snapshot().value, "none");
  assert.deepEqual(events, [
    "schedule:optimistic", "schedule:rolled-back",
    "schedule:optimistic", "schedule:committed",
    "schedule:undo", "schedule:rolled-back",
    "schedule:undo", "schedule:committed",
  ]);
});
