import assert from "node:assert/strict";
import test from "node:test";
import { projectInboxFilingResponse } from "../src/app/api/projects/[projectId]/area/route";
import { routineInboxFilingResponse } from "../src/app/api/routines/[routineId]/area/route";
import { fileRoutine } from "../src/lib/routine-filing";
import { InboxFilingCoordinator } from "../src/lib/inbox-filing-coordinator";

const request = (areaId: string | null) => new Request("http://test", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ areaId }),
});

test("Project Inbox filing delegates to the atomic fileProject boundary", async () => {
  const calls: unknown[] = [];
  const response = await projectInboxFilingResponse("project-1", request("area-1"), {
    fileProject: async (...args: unknown[]) => {
      calls.push(args);
      return { id: "project-1", areaId: "area-1" } as never;
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [["project-1", "area-1"]]);
  assert.deepEqual(await response.json(), { entity: { id: "project-1", areaId: "area-1" } });
});

test("Routine filing validates and updates inside one transaction", async () => {
  const calls: string[] = [];
  const argumentsSeen: unknown[] = [];
  const client = {
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) => {
      calls.push("transaction");
      return operation(client);
    },
    area: { findFirst: async (args: unknown) => { calls.push("area"); argumentsSeen.push(args); return { id: "area-1" }; } },
    routine: {
      findUnique: async (args: unknown) => { calls.push("routine"); argumentsSeen.push(args); return { id: "routine-1", areaId: null, status: "active" }; },
      update: async (args: unknown) => { calls.push("update"); argumentsSeen.push(args); return { id: "routine-1", areaId: "area-1" }; },
    },
  };
  const result = await fileRoutine("routine-1", "area-1", client as never);
  assert.deepEqual(result, { id: "routine-1", areaId: "area-1" });
  assert.deepEqual(calls, ["transaction", "routine", "area", "update"]);
  assert.deepEqual(argumentsSeen[1], {
    where: { id: "area-1", status: "active", isSystem: false },
    select: { id: true },
  });
  assert.deepEqual(argumentsSeen[2], {
    where: { id: "routine-1" },
    data: { areaId: "area-1" },
    select: { id: true, areaId: true },
  });
});

test("Routine route uses the same filing boundary", async () => {
  const calls: unknown[] = [];
  const response = await routineInboxFilingResponse("routine-1", request("area-1"), {
    fileRoutine: async (...args: unknown[]) => {
      calls.push(args);
      return { id: "routine-1", areaId: "area-1" } as never;
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [["routine-1", "area-1"]]);
});

test("filing routes redact unknown errors even when their text says not found", async () => {
  const project = await projectInboxFilingResponse("project-1", request("area-1"), {
    fileProject: async () => { throw new Error("record not found in internal Prisma callsite"); },
  });
  assert.equal(project.status, 500);
  assert.deepEqual(await project.json(), { error: "Project filing failed." });

  const routine = await routineInboxFilingResponse("routine-1", request("area-1"), {
    fileRoutine: async () => { throw new Error("record not found in internal Prisma callsite"); },
  });
  assert.equal(routine.status, 500);
  assert.deepEqual(await routine.json(), { error: "Routine filing failed." });
});

test("optimistic filing rolls back, retries, then offers exact Undo", async () => {
  type Location = { areaId: string | null; label: string };
  const scheduled: { current: { callback: () => void; delay: number } | null } = { current: null };
  let refreshCount = 0;
  const coordinator = new InboxFilingCoordinator<Location>(
    { areaId: null, label: "No area yet" },
    (left, right) => left.areaId === right.areaId,
    () => { refreshCount += 1; },
    {
      setTimeout: (callback, delay) => { scheduled.current = { callback, delay }; return 1; },
      clearTimeout: () => { scheduled.current = null; },
    },
  );
  const next = { areaId: "area-1", label: "Home / Studio" };
  let rejectWrite: (() => void) | undefined;
  const failedWrite = coordinator.mutate(next, () => new Promise<Location>((_resolve, reject) => {
    rejectWrite = () => reject(new Error("offline"));
  }));
  assert.deepEqual(coordinator.snapshot().value, next, "the Area path must update before the network settles");
  assert.equal(coordinator.snapshot().pending, true);
  await Promise.resolve();
  rejectWrite?.();
  await failedWrite;
  assert.deepEqual(coordinator.snapshot().value, { areaId: null, label: "No area yet" });
  assert.deepEqual(coordinator.snapshot().retryValue, next);

  await coordinator.retry(async (value) => value);
  assert.deepEqual(coordinator.snapshot().value, next);
  assert.deepEqual(coordinator.snapshot().undo?.previous, { areaId: null, label: "No area yet" });
  assert.equal(scheduled.current?.delay, 6000);
  assert.equal(refreshCount, 0, "the server list must remain stable throughout the Undo window");

  await coordinator.undo(async (value) => value);
  assert.deepEqual(coordinator.snapshot().value, { areaId: null, label: "No area yet" });
  assert.equal(refreshCount, 1);
  assert.equal(scheduled.current, null);
});

test("successful filing refreshes only when the exact six-second Undo window expires", async () => {
  type Location = { areaId: string | null; label: string };
  const timer: { callback: (() => void) | null } = { callback: null };
  let delay = 0;
  let refreshCount = 0;
  const coordinator = new InboxFilingCoordinator<Location>(
    { areaId: null, label: "No area yet" },
    (left, right) => left.areaId === right.areaId,
    () => { refreshCount += 1; },
    {
      setTimeout: (next, milliseconds) => { timer.callback = next; delay = milliseconds; return 1; },
      clearTimeout: () => { timer.callback = null; },
    },
  );
  await coordinator.mutate({ areaId: "area-1", label: "Home" }, async (value) => value);
  assert.equal(delay, 6000);
  assert.equal(refreshCount, 0);
  timer.callback?.();
  assert.equal(refreshCount, 1);
  assert.equal(coordinator.snapshot().undo, null);
});

test("disposing during an in-flight filing prevents a later timer and stale refresh", async () => {
  type Location = { areaId: string | null; label: string };
  let resolveWrite: ((value: Location) => void) | undefined;
  let timerCount = 0;
  let refreshCount = 0;
  const coordinator = new InboxFilingCoordinator<Location>(
    { areaId: null, label: "No area yet" },
    (left, right) => left.areaId === right.areaId,
    () => { refreshCount += 1; },
    {
      setTimeout: () => { timerCount += 1; return 1; },
      clearTimeout: () => {},
    },
  );
  const next = { areaId: "area-1", label: "Home" };
  const pending = coordinator.mutate(next, () => new Promise<Location>((resolve) => {
    resolveWrite = resolve;
  }));
  await Promise.resolve();
  coordinator.dispose();
  resolveWrite?.(next);
  await pending;
  assert.equal(timerCount, 0);
  assert.equal(refreshCount, 0);
});
