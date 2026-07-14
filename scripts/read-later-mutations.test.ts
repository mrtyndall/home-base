import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createReadLaterMutationCoordinator,
  nextReadLaterMutationError,
} from "../src/lib/read-later-mutation-coordinator";
import {
  performReadLaterFilingMutation,
  performReadLaterStatusMutation,
} from "../src/lib/read-later-action-service";

test("per-item coordinator serializes rapid mutations in submission order", async () => {
  const coordinator = createReadLaterMutationCoordinator();
  const events: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const first = coordinator.run("item-1", async () => {
    events.push("read:start");
    await gate;
    events.push("read:end");
    return "read";
  });
  const second = coordinator.run("item-1", async () => {
    events.push("archive:start");
    events.push("archive:end");
    return "archived";
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["read:start"]);

  releaseFirst?.();
  assert.deepEqual(await Promise.all([first, second]), ["read", "archived"]);
  assert.deepEqual(events, ["read:start", "read:end", "archive:start", "archive:end"]);
});

test("coordinator does not block mutations for different items", async () => {
  const coordinator = createReadLaterMutationCoordinator();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let secondStarted = false;
  const first = coordinator.run("item-1", () => gate);
  const second = coordinator.run("item-2", async () => { secondStarted = true; });

  await second;
  assert.equal(secondStarted, true);
  release?.();
  await first;
});

test("the latest serialized result controls the visible error", async () => {
  const coordinator = createReadLaterMutationCoordinator();
  let error: string | null = null;
  const apply = (result: { ok: true } | { ok: false; error: string }) => {
    error = nextReadLaterMutationError(result);
  };

  const failed = coordinator.run("item-1", async () => ({ ok: false as const, error: "First failed" })).then(apply);
  const recovered = coordinator.run("item-1", async () => ({ ok: true as const })).then(apply);
  await Promise.all([failed, recovered]);

  assert.equal(error, null);
});

test("status mutation returns an accessible error state instead of throwing", async () => {
  const result = await performReadLaterStatusMutation(
    { referenceId: "item-1", status: "read" },
    {
      setStatus: async () => { throw new Error("write failed"); },
      revalidate: () => assert.fail("failed mutations must not revalidate"),
    },
  );

  assert.deepEqual(result, {
    ok: false,
    error: "Could not update this Read Later item. Try again.",
  });
});

test("successful mutations return an explicit empty error state", async () => {
  const result = await performReadLaterStatusMutation(
    { referenceId: "item-1", status: "read" },
    {
      setStatus: async () => ({ id: "item-1", areaId: null, projectId: null }),
      revalidate: () => undefined,
    },
  );

  assert.deepEqual(result, { ok: true, error: null });
});

test("filing mutation reports unavailable destinations and preserves the item", async () => {
  let updated = false;
  const result = await performReadLaterFilingMutation(
    { referenceId: "item-1", filing: { mode: "project", projectId: "closed" } },
    {
      findReference: async () => ({ id: "item-1", areaId: null, projectId: null }),
      resolveDestination: async () => { throw new Error("Project not found."); },
      updateReference: async () => { updated = true; return { id: "item-1", areaId: null, projectId: null }; },
      revalidate: () => assert.fail("failed mutations must not revalidate"),
    },
  );

  assert.equal(updated, false);
  assert.deepEqual(result, {
    ok: false,
    error: "That filing destination is no longer available.",
  });
});
