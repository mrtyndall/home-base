import assert from "node:assert/strict";
import test from "node:test";

import {
  createAreaForApi,
  createProjectForApi,
  listAreasForApi,
  patchAreaForApi,
  patchProjectForApi,
  toApiErrorResponse,
  toHierarchyApiError,
} from "../src/lib/api/hierarchy";

type Area = {
  id: string;
  name: string;
  parentAreaId: string | null;
  sortOrder: number;
  status: "active" | "retired";
  isSystem: boolean;
};

function apiClient(seed?: { areas?: Area[]; failActivity?: boolean }) {
  const calls: string[] = [];
  const areas = new Map((seed?.areas ?? [
    { id: "area-1", name: "Home", parentAreaId: null, sortOrder: 1, status: "active", isSystem: false },
    { id: "inactive", name: "Inactive", parentAreaId: null, sortOrder: 2, status: "retired", isSystem: false },
    { id: "system", name: "System", parentAreaId: null, sortOrder: 3, status: "active", isSystem: true },
  ]).map((area) => [area.id, { ...area }]));
  const project = {
    id: "project-1",
    name: "Original",
    areaId: null as string | null,
    status: "active",
    currentState: null as string | null,
    nextStep: null as string | null,
    targetDate: null as Date | null,
  };
  const activities: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];

  const transaction = {
    $queryRawUnsafe: async () => {
      calls.push("hierarchy:lock");
      return [{ pg_advisory_xact_lock: null }];
    },
    area: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const area = typeof where.id === "string"
          ? areas.get(where.id)
          : [...areas.values()].find((candidate) =>
              typeof where.name === "object" && where.name !== null &&
              candidate.name.toLowerCase() === String((where.name as { equals: string }).equals).toLowerCase());
        if (!area || (where.status && area.status !== where.status) ||
          (where.isSystem !== undefined && area.isSystem !== where.isSystem)) return null;
        return { ...area };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const area = areas.get(where.id);
        return area ? { ...area } : null;
      },
      create: async ({ data }: { data: Area }) => {
        calls.push(`area:create:${data.parentAreaId}`);
        const area = { ...data, status: data.status ?? "active", isSystem: false, sortOrder: data.sortOrder ?? 0 };
        areas.set(area.id, area);
        return { ...area };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Area> }) => {
        const area = areas.get(where.id);
        if (!area) throw new Error("record missing");
        calls.push("area:update");
        Object.assign(area, data);
        return { ...area };
      },
      findMany: async (args?: { select?: object; where?: { id?: { in: string[] } } }) => {
        const selected = args?.where?.id?.in
          ? args.where.id.in.map((id) => areas.get(id)).filter(Boolean)
          : [...areas.values()];
        return selected.map((area) => ({ ...area! }));
      },
    },
    project: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === project.id ? { ...project } : null,
      create: async ({ data }: { data: Partial<typeof project> & { name: string } }) => {
        calls.push("project:create");
        Object.assign(project, data, { id: "created-project" });
        return { ...project };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<typeof project> }) => {
        assert.equal(where.id, project.id);
        calls.push("project:update");
        Object.assign(project, data);
        return { ...project };
      },
    },
    task: { updateMany: async () => { calls.push("tasks"); return { count: 1 }; } },
    idea: { updateMany: async () => { calls.push("ideas"); return { count: 1 }; } },
    reference: { updateMany: async () => { calls.push("references"); return { count: 1 }; } },
    projectActivity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (seed?.failActivity) throw new Error("activity write failed");
        activities.push(data);
        calls.push("activity");
        return { id: "activity-1" };
      },
    },
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        notifications.push(data);
        calls.push("notification");
        return { id: "notification-1" };
      },
    },
  };

  const client = {
    ...transaction,
    $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) => {
      calls.push("transaction");
      const before = { ...project };
      const beforeActivities = activities.length;
      const beforeNotifications = notifications.length;
      try {
        return await operation(transaction);
      } catch (error) {
        Object.assign(project, before);
        activities.length = beforeActivities;
        notifications.length = beforeNotifications;
        throw error;
      }
    },
  };
  return { client, calls, areas, project, activities, notifications };
}

test("Project POST allows unfiled Projects and audits in one transaction", async () => {
  const fake = apiClient();
  const created = await createProjectForApi({ name: "Loose" }, { label: "Hermes" }, fake.client as never);
  assert.equal(created.areaId, null);
  assert.deepEqual(fake.calls, ["transaction", "project:create", "activity", "notification"]);
  assert.equal(fake.activities[0]?.source, "api:Hermes");
  assert.deepEqual(fake.notifications[0]?.sourceRef, {
    type: "project", id: "created-project", source: "api", actor: "Hermes",
  });
});

test("Project POST and PATCH reject inactive and system Areas through one eligibility rule", async () => {
  for (const areaId of ["inactive", "system"]) {
    const createFake = apiClient();
    await assert.rejects(
      createProjectForApi({ name: "No", areaId }, { label: "Hermes" }, createFake.client as never),
      (error: unknown) => (error as { code?: string }).code === "area_not_found",
    );
    const patchFake = apiClient();
    await assert.rejects(
      patchProjectForApi("project-1", { areaId }, { label: "Hermes" }, patchFake.client as never),
      (error: unknown) => (error as { code?: string }).code === "area_not_found",
    );
  }
});

test("Project PATCH files, updates, mirrors, logs, and audits atomically with API provenance", async () => {
  const fake = apiClient();
  const updated = await patchProjectForApi(
    "project-1",
    { areaId: "area-1", currentState: "Moving", nextStep: "Call", logEntry: "Updated once" },
    { label: "Hermes" },
    fake.client as never,
  );
  assert.equal(updated.areaId, "area-1");
  assert.equal(updated.currentState, "Moving");
  assert.deepEqual(fake.calls, [
    "transaction", "project:update", "tasks", "ideas", "references", "activity", "notification",
  ]);
  assert.equal(fake.activities.length, 1);
  assert.equal(fake.activities[0]?.source, "api:Hermes");
  assert.equal(fake.activities[0]?.entry, "Updated once");
  assert.equal(fake.notifications.length, 1);
  assert.deepEqual(fake.notifications[0]?.sourceRef, {
    type: "project", id: "project-1", source: "api", actor: "Hermes",
  });
});

test("Project PATCH rolls back filing and fields when its activity write fails", async () => {
  const fake = apiClient({ failActivity: true });
  await assert.rejects(
    patchProjectForApi("project-1", { areaId: "area-1", name: "Changed" }, { label: "Hermes" }, fake.client as never),
    /activity write failed/,
  );
  assert.equal(fake.project.areaId, null);
  assert.equal(fake.project.name, "Original");
  assert.equal(fake.notifications.length, 0);
});

test("conflicting Area fields return stable 400 while internal errors are not remapped", async () => {
  const fake = apiClient();
  let conflict: unknown;
  try {
    await createProjectForApi(
      { name: "Conflict", areaId: "system", areaName: "Home" },
      { label: "Hermes" },
      fake.client as never,
    );
  } catch (error) {
    conflict = error;
  }
  const response = toHierarchyApiError(conflict);
  assert.equal(response?.status, 400);
  assert.deepEqual(await response?.json(), {
    error: { code: "conflicting_area_fields", message: "Conflicting Area fields." },
  });
  assert.equal(toHierarchyApiError(new Error("database unavailable")), null);
  const internal = toApiErrorResponse(new Error("database unavailable"));
  assert.equal(internal.status, 500);
  assert.deepEqual(await internal.json(), { error: "API request failed." });
});

test("Area PATCH rejects cycles and returns 404 for a missing Area", async () => {
  const fake = apiClient({ areas: [
    { id: "root", name: "Root", parentAreaId: null, sortOrder: 0, status: "active", isSystem: false },
    { id: "child", name: "Child", parentAreaId: "root", sortOrder: 0, status: "active", isSystem: false },
  ] });
  await assert.rejects(
    patchAreaForApi("root", { parentAreaId: "child" }, { label: "Hermes" }, fake.client as never),
    (error: unknown) => (error as { code?: string }).code === "cycle",
  );
  let missing: unknown;
  try {
    await patchAreaForApi("missing", { parentAreaId: null }, { label: "Hermes" }, fake.client as never);
  } catch (error) {
    missing = error;
  }
  assert.equal(toHierarchyApiError(missing)?.status, 404);
});

test("Area PATCH holds the hierarchy lock through update and audit", async () => {
  const fake = apiClient({ areas: [
    { id: "root", name: "Root", parentAreaId: null, sortOrder: 0, status: "active", isSystem: false },
    { id: "child", name: "Child", parentAreaId: null, sortOrder: 0, status: "active", isSystem: false },
  ] });

  await patchAreaForApi(
    "child",
    { parentAreaId: "root" },
    { label: "Hermes" },
    fake.client as never,
  );

  const lockIndex = fake.calls.indexOf("hierarchy:lock");
  const updateIndex = fake.calls.indexOf("area:update");
  const auditIndex = fake.calls.indexOf("notification");
  assert.ok(lockIndex >= 0 && lockIndex < updateIndex);
  assert.ok(updateIndex < auditIndex);
});

test("Area POST uses a non-empty generated ID and treats an empty parent as root", async () => {
  const fake = apiClient();
  const area = await createAreaForApi(
    { name: "New", parentAreaId: "" },
    { label: "Hermes" },
    fake.client as never,
  );
  assert.ok(area.id.length > 0);
  assert.equal(area.parentAreaId, null);
});

test("Area list flattens the complete hierarchy before applying its limit", async () => {
  const roots = Array.from({ length: 100 }, (_, index): Area => ({
    id: `root-${index}`, name: `Root ${String(index).padStart(3, "0")}`,
    parentAreaId: null, sortOrder: index, status: "active", isSystem: false,
  }));
  const lateParent: Area = {
    id: "late-parent", name: "Late", parentAreaId: null, sortOrder: 1000, status: "active", isSystem: false,
  };
  const earlyChild: Area = {
    id: "early-child", name: "Child", parentAreaId: "late-parent", sortOrder: -1000, status: "active", isSystem: false,
  };
  const fake = apiClient({ areas: [...roots, lateParent, earlyChild] });
  const listed = await listAreasForApi(fake.client as never, 100);
  assert.equal(listed.length, 100);
  assert.equal(listed.some((area) => area.id === "early-child"), false,
    "a child beyond the tree limit must not be promoted by a truncated parent query");

  const complete = await listAreasForApi(fake.client as never, 102);
  assert.equal(complete.at(-2)?.id, "late-parent");
  assert.equal(complete.at(-1)?.path, "Late / Child");
});
