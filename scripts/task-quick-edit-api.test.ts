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
};

function quickEditClient(taskOverrides: Partial<TaskRecord> = {}) {
  const task: TaskRecord = {
    id: "task-1",
    title: "Call the radio club",
    status: "open",
    areaId: null,
    projectId: null,
    dueDate: null,
    someday: false,
    ...taskOverrides,
  };
  const areas = [
    { id: "home", name: "Home", parentAreaId: null, sortOrder: 1, status: "active", isSystem: false },
    { id: "hobbies", name: "Hobbies", parentAreaId: null, sortOrder: 2, status: "active", isSystem: false },
    { id: "radio", name: "Ham Radio", parentAreaId: "hobbies", sortOrder: 1, status: "active", isSystem: false },
    { id: "retired", name: "Old", parentAreaId: null, sortOrder: 3, status: "retired", isSystem: false },
    { id: "system", name: "System", parentAreaId: null, sortOrder: 4, status: "active", isSystem: true },
  ];
  const projects = [
    { id: "antenna", name: "Antenna", areaId: "radio", status: "active" },
    { id: "loose", name: "Loose plan", areaId: null, status: "parked" },
    { id: "old-project", name: "Old project", areaId: "retired", status: "active" },
    { id: "done-project", name: "Done project", areaId: "home", status: "completed" },
  ];
  const updates: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const calls: string[] = [];

  const client = {
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
        return areas.filter((area) =>
          (!where?.status || area.status === where.status) &&
          (where?.isSystem === undefined || area.isSystem === where.isSystem))
          .map((area) => ({ ...area }));
      },
      findFirst: async ({ where }: { where: { id: string } }) => {
        calls.push("area:findFirst");
        const area = areas.find((candidate) => candidate.id === where.id);
        return area?.status === "active" && !area.isSystem ? { id: area.id } : null;
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
        notifications.push(data);
        return { id: `notification-${notifications.length}` };
      },
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
      { id: "antenna", type: "project", label: "Antenna — Hobbies / Ham Radio", areaId: "radio", projectId: "antenna" },
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
  assert.deepEqual(fake.updates, [{ areaId: "radio", projectId: "antenna" }]);
  assert.equal(fake.notifications.length, 1, "one successful write must create exactly one audit notification");
});

test("assignment PATCH returns Inbox after clearing both destination fields", async () => {
  const fake = quickEditClient({ areaId: "home" });
  const response = await taskAssignmentResponse("task-1", request({ areaId: null, projectId: null }), fake.client as never);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).displayLabel, "Inbox");
  assert.deepEqual(fake.updates, [{ areaId: null, projectId: null }]);
  assert.equal(fake.notifications.length, 1);
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
    assert.equal(fake.notifications.length, 1);
  }
});

test("missing, closed, and invalid requests do not mutate or audit", async () => {
  const missing = quickEditClient();
  assert.equal((await taskAssignmentOptionsResponse("missing", missing.client as never)).status, 404);

  const closed = quickEditClient({ status: "completed" });
  assert.equal((await taskAssignmentResponse("task-1", request({ areaId: "home" }), closed.client as never)).status, 409);

  const invalid = quickEditClient();
  assert.equal((await taskScheduleResponse("task-1", request({ dueDate: "July 18" }), invalid.client as never)).status, 400);

  for (const fake of [missing, closed, invalid]) {
    assert.equal(fake.updates.length, 0);
    assert.equal(fake.notifications.length, 0);
  }
});
