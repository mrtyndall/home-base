import assert from "node:assert/strict";
import test from "node:test";

import { convertIdeaForApi } from "../src/lib/api/idea-conversion";
import { updateMilestoneForApi } from "../src/lib/api/milestone";

test("task conversion updates the Idea and writes task + conversion audits atomically", async () => {
  const calls: string[] = [];
  const tx = {
    idea: {
      findUnique: async () => ({ id: "idea-1", title: "Seed", body: "Context", areaId: null }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("idea:update");
        return { id: "idea-1", ...data };
      },
    },
    area: { findFirst: async () => null },
    project: { findUnique: async () => null },
    task: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("task:create");
        return { id: "task-1", title: data.title, areaId: null, projectId: null };
      },
    },
    notification: {
      create: async ({ data }: { data: { type: string } }) => {
        calls.push(`audit:${data.type}`);
        return { id: `audit-${calls.length}` };
      },
    },
  };
  const client = {
    $transaction: async <T>(operation: (client: typeof tx) => Promise<T>) => {
      calls.push("transaction");
      return operation(tx);
    },
  };

  const result = await convertIdeaForApi(
    "idea-1",
    { to: "task" },
    { label: "Hermes" },
    client as never,
  );

  assert.ok(result);
  assert.equal(result.type, "task");
  assert.deepEqual(calls, [
    "transaction",
    "task:create",
    "audit:task_created",
    "idea:update",
    "audit:idea_converted",
  ]);
});

test("a conversion-audit failure rolls back the task and Idea conversion", async () => {
  const state = {
    idea: { status: "seed", convertedToType: null as string | null, convertedToId: null as string | null },
    tasks: [] as Array<{ id: string }>,
    notifications: [] as string[],
  };
  const tx = {
    idea: {
      findUnique: async () => ({ id: "idea-1", title: "Seed", body: null, areaId: null }),
      update: async ({ data }: { data: Partial<typeof state.idea> }) => {
        Object.assign(state.idea, data);
        return { id: "idea-1", ...state.idea };
      },
    },
    area: { findFirst: async () => null },
    project: { findUnique: async () => null },
    task: {
      create: async () => {
        const task = { id: "task-1", title: "Seed", areaId: null, projectId: null };
        state.tasks.push(task);
        return task;
      },
    },
    notification: {
      create: async ({ data }: { data: { type: string } }) => {
        if (data.type === "idea_converted") throw new Error("conversion audit failed");
        state.notifications.push(data.type);
        return { id: "audit-1" };
      },
    },
  };
  const client = {
    $transaction: async <T>(operation: (client: typeof tx) => Promise<T>) => {
      const before = structuredClone(state);
      try {
        return await operation(tx);
      } catch (error) {
        state.idea = before.idea;
        state.tasks = before.tasks;
        state.notifications = before.notifications;
        throw error;
      }
    },
  };

  await assert.rejects(
    convertIdeaForApi("idea-1", { to: "task" }, { label: "Hermes" }, client as never),
    /conversion audit failed/,
  );
  assert.deepEqual(state, {
    idea: { status: "seed", convertedToType: null, convertedToId: null },
    tasks: [],
    notifications: [],
  });
});

test("reopening a milestone clears completedAt and audits in the same transaction", async () => {
  const calls: string[] = [];
  let updateData: Record<string, unknown> | undefined;
  const tx = {
    milestone: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("milestone:update");
        updateData = data;
        return { id: "milestone-1", ...data };
      },
    },
    notification: {
      create: async () => {
        calls.push("audit");
        return { id: "audit-1" };
      },
    },
  };
  const client = {
    $transaction: async <T>(operation: (client: typeof tx) => Promise<T>) => {
      calls.push("transaction");
      return operation(tx);
    },
  };

  await updateMilestoneForApi(
    "milestone-1",
    { status: "open" },
    { label: "Hermes" },
    client as never,
  );

  assert.equal(updateData?.completedAt, null);
  assert.deepEqual(calls, ["transaction", "milestone:update", "audit"]);
});
