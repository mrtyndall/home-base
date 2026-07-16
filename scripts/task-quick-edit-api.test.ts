import assert from "node:assert/strict";
import test from "node:test";

import { taskAssignmentOptionsResponse } from "../src/app/api/tasks/[taskId]/assignment-options/route";
import { taskAssignmentResponse } from "../src/app/api/tasks/[taskId]/assignment/route";
import { taskScheduleResponse } from "../src/app/api/tasks/[taskId]/schedule/route";

type TaskRecord = {
  id: string;
  title: string;
  status: "open" | "completed";
  areaId: string | null;
  projectId: string | null;
  dueDate: Date | null;
  someday: boolean;
  triagedAt: Date | null;
};

function quickEditClient(
  taskOverrides: Partial<TaskRecord> = {},
  failures: { areaLookup?: boolean; notification?: boolean } = {},
) {
  const task: TaskRecord = {
    id: "task-1",
    title: "Call the radio club",
    status: "open",
    areaId: null,
    projectId: null,
    dueDate: null,
    someday: false,
    triagedAt: null,
    ...taskOverrides,
  };
  const areas = [
    { id: "home", name: "Home", parentAreaId: null, sortOrder: 1, status: "active", isSystem: false },
    { id: "hobbies", name: "Hobbies", parentAreaId: null, sortOrder: 2, status: "active", isSystem: false },
    { id: "radio", name: "Ham Radio", parentAreaId: "hobbies", sortOrder: 1, status: "active", isSystem: false },
    { id: "retired", name: "Old", parentAreaId: null, sortOrder: 3, status: "retired", isSystem: false },
    { id: "legacy", name: "Still active", parentAreaId: "retired", sortOrder: 1, status: "active", isSystem: false },
    { id: "system", name: "System", parentAreaId: null, sortOrder: 4, status: "active", isSystem: true },
  ];
  const projects = [
    { id: "antenna", name: "Antenna", areaId: "radio", status: "active" },
    { id: "loose", name: "Loose plan", areaId: null, status: "parked" },
    { id: "later", name: "Later project", areaId: "home", status: "someday" },
    { id: "legacy-project", name: "Legacy project", areaId: "legacy", status: "active" },
    { id: "old-project", name: "Old project", areaId: "retired", status: "active" },
    { id: "done-project", name: "Done project", areaId: "home", status: "completed" },
  ];
  const updates: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const calls: string[] = [];

  const transaction = {
    task: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        calls.push("task:findUnique");
        return where.id === task.id ? { ...task } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<TaskRecord> }) => {
        assert.equal(where.id, task.id);
        calls.push("task:update");
        updates.push(data);
        Object.assign(task, data);
        return { ...task };
      },
    },
    area: {
      findMany: async ({ where }: { where?: { status?: string; isSystem?: boolean } }) => {
        calls.push("area:findMany");
        if (failures.areaLookup) throw new Error("area lookup failed");
        return areas.filter((area) =>
          (!where?.status || area.status === where.status) &&
          (where?.isSystem === undefined || area.isSystem === where.isSystem))
          .map((area) => ({ ...area }));
      },
      findFirst: async ({ where }: {
        where: { id: string; status?: string; isSystem?: boolean };
      }) => {
        calls.push("area:findFirst");
        const area = areas.find((candidate) => candidate.id === where.id);
        if (!area) return null;
        if (where.status !== undefined && area.status !== where.status) return null;
        if (where.isSystem !== undefined && area.isSystem !== where.isSystem) return null;
        return { id: area.id };
      },
    },
    project: {
      findMany: async ({ where }: {
        where?: {
          status?: { in: string[] };
          OR?: Array<{ areaId: null | { in: string[] } }>;
        };
      }) => {
        calls.push("project:findMany");
        return projects.filter((project) =>
          (!where?.status || where.status.in.includes(project.status)) &&
          (!where?.OR || where.OR.some((condition) =>
            condition.areaId === null
              ? project.areaId === null
              : project.areaId !== null && condition.areaId.in.includes(project.areaId))))
          .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
          .map((project) => ({ ...project }));
      },
      findFirst: async ({ where }: { where: { id: string } }) => {
        calls.push("project:findFirst");
        const project = projects.find((candidate) => candidate.id === where.id);
        if (!project || !["active", "parked", "someday"].includes(project.status)) return null;
        if (project.areaId && !areas.some((area) =>
          area.id === project.areaId && area.status === "active" && !area.isSystem)) return null;
        return { id: project.id, name: project.name, areaId: project.areaId };
      },
    },
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("notification:create");
        if (failures.notification) throw new Error("notification failed");
        notifications.push(data);
        return { id: `notification-${notifications.length}` };
      },
    },
  };

  const client = {
    ...transaction,
    $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) => {
      calls.push("transaction");
      const beforeTask = { ...task };
      const beforeUpdates = updates.length;
      const beforeNotifications = notifications.length;
      try {
        return await operation(transaction);
      } catch (error) {
        Object.assign(task, beforeTask);
        updates.length = beforeUpdates;
        notifications.length = beforeNotifications;
        throw error;
      }
    },
  };

  return { client, task, updates, notifications, calls };
}

function request(body: unknown) {
  return new Request("http://homebase.test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("assignment options load eligible hierarchy on demand with Inbox and path labels", async () => {
  const fake = quickEditClient();
  assert.deepEqual(fake.calls, [], "constructing the client must not eagerly load destinations");

  const response = await taskAssignmentOptionsResponse("task-1", fake.client as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    options: [
      { id: "inbox", type: "inbox", label: "Inbox", areaId: null, projectId: null },
      { id: "home", type: "area", label: "Home", areaId: "home", projectId: null },
      { id: "hobbies", type: "area", label: "Hobbies", areaId: "hobbies", projectId: null },
      { id: "radio", type: "area", label: "Hobbies / Ham Radio", areaId: "radio", projectId: null },
      { id: "legacy", type: "area", label: "Old / Still active", areaId: "legacy", projectId: null },
      { id: "antenna", type: "project", label: "Antenna — Hobbies / Ham Radio", areaId: "radio", projectId: "antenna" },
      { id: "later", type: "project", label: "Later project — Home", areaId: "home", projectId: "later" },
      { id: "legacy-project", type: "project", label: "Legacy project — Old / Still active", areaId: "legacy", projectId: "legacy-project" },
      { id: "loose", type: "project", label: "Loose plan — No area yet", areaId: null, projectId: "loose" },
    ],
  });
  assert.deepEqual(fake.calls, ["task:findUnique", "area:findMany", "project:findMany"]);
  assert.equal(fake.notifications.length, 0);
});

test("assignment PATCH derives Area from Project and returns its authoritative path label", async () => {
  const fake = quickEditClient();

  const response = await taskAssignmentResponse(
    "task-1",
    request({ areaId: "home", projectId: "antenna" }),
    fake.client as never,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    task: { id: "task-1", areaId: "radio", projectId: "antenna" },
    displayLabel: "Antenna — Hobbies / Ham Radio",
  });
  assert.deepEqual(
    { ...fake.updates[0], triagedAt: undefined },
    { areaId: "radio", projectId: "antenna", triagedAt: undefined },
  );
  assert.ok(fake.updates[0]?.triagedAt instanceof Date);
  assert.equal(fake.notifications.length, 1, "one successful write must create exactly one audit notification");
});

test("assignment PATCH returns Inbox after clearing both destination fields without clearing triage", async () => {
  const triagedAt = new Date("2026-07-16T12:00:00.000Z");
  const fake = quickEditClient({ areaId: "home", triagedAt });
  const response = await taskAssignmentResponse("task-1", request({ areaId: null, projectId: null }), fake.client as never);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).displayLabel, "Inbox");
  assert.deepEqual(fake.updates, [{ areaId: null, projectId: null, triagedAt }]);
  assert.equal(fake.notifications.length, 1);
});

test("assignment PATCH rejects a direct system Area using the shared eligibility query", async () => {
  const fake = quickEditClient();
  const response = await taskAssignmentResponse("task-1", request({ areaId: "system" }), fake.client as never);

  assert.equal(response.status, 404);
  assert.equal(fake.updates.length, 0);
  assert.equal(fake.notifications.length, 0);
});

test("assignment no-op returns the authoritative path label without update or audit", async () => {
  const fake = quickEditClient({ areaId: "radio", projectId: "antenna" });
  const response = await taskAssignmentResponse(
    "task-1",
    request({ areaId: "home", projectId: "antenna" }),
    fake.client as never,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    task: { id: "task-1", areaId: "radio", projectId: "antenna" },
    displayLabel: "Antenna — Hobbies / Ham Radio",
  });
  assert.equal(fake.updates.length, 0);
  assert.equal(fake.notifications.length, 0);
});

test("assignment resolves its display label before any write", async () => {
  const fake = quickEditClient({}, { areaLookup: true });

  await assert.rejects(
    taskAssignmentResponse("task-1", request({ areaId: "home" }), fake.client as never),
    /area lookup failed/,
  );
  assert.equal(fake.updates.length, 0);
  assert.equal(fake.notifications.length, 0);
  assert.equal(fake.calls.includes("transaction"), false);
});

test("assignment and schedule roll back their task update when notification creation fails", async () => {
  const assignment = quickEditClient({}, { notification: true });
  await assert.rejects(
    taskAssignmentResponse("task-1", request({ areaId: "home" }), assignment.client as never),
    /notification failed/,
  );
  assert.equal(assignment.task.areaId, null);
  assert.equal(assignment.updates.length, 0);
  assert.equal(assignment.notifications.length, 0);

  const schedule = quickEditClient({}, { notification: true });
  await assert.rejects(
    taskScheduleResponse("task-1", request({ dueDate: "2026-07-18" }), schedule.client as never),
    /notification failed/,
  );
  assert.equal(schedule.task.dueDate, null);
  assert.equal(schedule.updates.length, 0);
  assert.equal(schedule.notifications.length, 0);
});

test("schedule PATCH returns authoritative date, Someday, and No date labels with one audit per write", async () => {
  const cases = [
    { payload: { dueDate: "2026-07-18", someday: false }, label: "Jul 18" },
    { payload: { dueDate: null, someday: true }, label: "Someday" },
    { payload: { dueDate: null, someday: false }, label: "No date" },
  ];

  for (const { payload, label } of cases) {
    const fake = quickEditClient({ dueDate: new Date("2026-07-17T00:00:00.000Z") });
    const response = await taskScheduleResponse("task-1", request(payload), fake.client as never);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).displayLabel, label);
    assert.equal(fake.updates.length, 1);
    assert.ok(fake.updates[0]?.triagedAt instanceof Date);
    assert.equal(fake.notifications.length, 1);
  }
});

test("schedule date, Someday, and No date no-ops return authoritative labels without audit", async () => {
  const cases = [
    {
      current: { dueDate: new Date("2026-07-18T00:00:00.000Z"), someday: false },
      payload: { dueDate: "2026-07-18", someday: false },
      label: "Jul 18",
    },
    {
      current: { dueDate: null, someday: true },
      payload: { dueDate: null, someday: true },
      label: "Someday",
    },
    {
      current: { dueDate: null, someday: false },
      payload: { dueDate: null, someday: false },
      label: "No date",
    },
  ];

  for (const { current, payload, label } of cases) {
    const fake = quickEditClient(current);
    const response = await taskScheduleResponse("task-1", request(payload), fake.client as never);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).displayLabel, label);
    assert.equal(fake.updates.length, 0);
    assert.equal(fake.task.triagedAt, null);
    assert.equal(fake.notifications.length, 0);
  }
});

test("missing, closed, and invalid requests do not mutate or audit", async () => {
  const missing = quickEditClient();
  assert.equal((await taskAssignmentOptionsResponse("missing", missing.client as never)).status, 404);

  const closed = quickEditClient({ status: "completed" });
  assert.equal((await taskAssignmentOptionsResponse("task-1", closed.client as never)).status, 409);
  assert.equal((await taskAssignmentResponse("task-1", request({ areaId: "home" }), closed.client as never)).status, 409);

  const invalid = quickEditClient();
  assert.equal((await taskScheduleResponse("task-1", request({ dueDate: "July 18" }), invalid.client as never)).status, 400);

  for (const fake of [missing, closed, invalid]) {
    assert.equal(fake.updates.length, 0);
    assert.equal(fake.notifications.length, 0);
  }
});
