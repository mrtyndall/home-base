import assert from "node:assert/strict";
import test from "node:test";

import { resolveVerifiedDestination } from "../src/lib/destinations";
import { fileProject } from "../src/lib/hierarchy";

type ProjectRow = {
  id: string;
  name: string;
  areaId: string | null;
  status: "active";
  currentState: string | null;
  nextStep: string | null;
};

type AreaRow = {
  id: string;
  status: "active" | "retired";
  isSystem: boolean;
};

function filingClient(initialAreaId: string | null = null) {
  const calls: string[] = [];
  const activities: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const project: ProjectRow = {
    id: "project-1",
    name: "Project One",
    areaId: initialAreaId,
    status: "active",
    currentState: null,
    nextStep: null,
  };
  const areas = new Map<string, AreaRow>([
    ["area-1", { id: "area-1", status: "active", isSystem: false }],
    ["area-2", { id: "area-2", status: "active", isSystem: false }],
    ["inactive", { id: "inactive", status: "retired", isSystem: false }],
    ["system", { id: "system", status: "active", isSystem: true }],
  ]);

  const transaction = {
    area: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; status?: string; isSystem?: boolean };
      }) => {
        calls.push(`area:${where.id}`);
        const area = areas.get(where.id);
        if (!area) return null;
        if (where.status !== undefined && area.status !== where.status) return null;
        if (where.isSystem !== undefined && area.isSystem !== where.isSystem) {
          return null;
        }
        return { id: area.id };
      },
    },
    project: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === project.id ? { ...project } : null,
      update: async ({ data }: { data: { areaId: string | null } }) => {
        calls.push(`project:${data.areaId}`);
        project.areaId = data.areaId;
        return { ...project };
      },
    },
    task: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { projectId: string };
        data: { areaId: string | null };
      }) => {
        assert.deepEqual(where, { projectId: "project-1" });
        calls.push(`tasks:${data.areaId}`);
        return { count: 1 };
      },
    },
    idea: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { projectId: string };
        data: { areaId: string | null };
      }) => {
        assert.deepEqual(where, { projectId: "project-1" });
        calls.push(`ideas:${data.areaId}`);
        return { count: 1 };
      },
    },
    reference: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { projectId: string };
        data: { areaId: string | null };
      }) => {
        assert.deepEqual(where, { projectId: "project-1" });
        calls.push(`references:${data.areaId}`);
        return { count: 1 };
      },
    },
    projectActivity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("activity");
        activities.push(data);
        return { id: "activity-1" };
      },
    },
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("notification");
        notifications.push(data);
        return { id: "notification-1" };
      },
    },
  };

  return {
    calls,
    activities,
    notifications,
    project,
    client: {
      $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) => {
        calls.push("transaction");
        return operation(transaction);
      },
    },
  };
}

test("fileProject assigns a Project and mirrors its Area to children", async () => {
  const fake = filingClient();

  const project = await fileProject("project-1", "area-1", fake.client as never);

  assert.equal(project.areaId, "area-1");
  assert.deepEqual(fake.calls, [
    "transaction",
    "area:area-1",
    "project:area-1",
    "tasks:area-1",
    "ideas:area-1",
    "references:area-1",
    "activity",
    "notification",
  ]);
  assert.equal(fake.activities[0]?.source, "manual");
  assert.deepEqual(fake.notifications[0]?.sourceRef, {
    type: "project", id: "project-1", source: "manual",
  });
});

test("fileProject moves a Project between Areas", async () => {
  const fake = filingClient("area-1");

  const project = await fileProject("project-1", "area-2", fake.client as never);

  assert.equal(project.areaId, "area-2");
  assert.ok(fake.calls.includes("tasks:area-2"));
  assert.ok(fake.calls.includes("ideas:area-2"));
  assert.ok(fake.calls.includes("references:area-2"));
});

test("fileProject unfiles a Project and its children", async () => {
  const fake = filingClient("area-1");

  const project = await fileProject("project-1", null, fake.client as never);

  assert.equal(project.areaId, null);
  assert.equal(fake.calls.some((call) => call.startsWith("area:")), false);
  assert.ok(fake.calls.includes("tasks:null"));
  assert.ok(fake.calls.includes("ideas:null"));
  assert.ok(fake.calls.includes("references:null"));
});

test("fileProject rejects a missing Area before writes", async () => {
  const fake = filingClient("area-1");

  await assert.rejects(
    fileProject("project-1", "missing", fake.client as never),
    /Area not found/,
  );

  assert.deepEqual(fake.calls, ["transaction", "area:missing"]);
  assert.equal(fake.project.areaId, "area-1");
});

test("fileProject rejects an inactive Area before writes", async () => {
  const fake = filingClient("area-1");

  await assert.rejects(
    fileProject("project-1", "inactive", fake.client as never),
    /Area not found/,
  );

  assert.deepEqual(fake.calls, ["transaction", "area:inactive"]);
  assert.equal(fake.project.areaId, "area-1");
});

test("fileProject rejects a system Area before writes", async () => {
  const fake = filingClient("area-1");

  await assert.rejects(
    fileProject("project-1", "system", fake.client as never),
    /Area not found/,
  );

  assert.deepEqual(fake.calls, ["transaction", "area:system"]);
  assert.equal(fake.project.areaId, "area-1");
});

test("resolveVerifiedDestination accepts an unfiled Project as authoritative", async () => {
  let projectWhere: unknown;
  const client = {
    area: { findFirst: async () => ({ id: "area-1" }) },
    project: {
      findFirst: async ({ where }: { where: unknown }) => {
        projectWhere = where;
        return { id: "project-1", areaId: null };
      },
    },
  };

  assert.deepEqual(
    await resolveVerifiedDestination(
      { projectId: "project-1", areaId: null },
      client,
    ),
    { projectId: "project-1", areaId: null },
  );
  assert.deepEqual(projectWhere, {
    id: "project-1",
    status: { in: ["active", "parked", "someday"] },
  });
  await assert.rejects(
    resolveVerifiedDestination(
      { projectId: "project-1", areaId: "area-1" },
      client,
    ),
    /Project does not belong to the selected Area/,
  );
});

test("resolveVerifiedDestination rejects completed Projects", async () => {
  const completed = { id: "project-1", areaId: "area-1", status: "completed" };
  const client = {
    area: { findFirst: async () => null },
    project: {
      findFirst: async ({ where }: {
        where: { id: string; status?: { in: string[] } };
      }) =>
        where.id === completed.id && where.status?.in.includes(completed.status)
          ? completed
          : null,
    },
  };

  await assert.rejects(
    resolveVerifiedDestination({ projectId: completed.id }, client),
    /Project not found/,
  );
});

test("resolveVerifiedDestination rejects a system Area through its real query contract", async () => {
  const systemArea = { id: "system", status: "active", isSystem: true };
  const client = {
    area: {
      findFirst: async ({ where }: {
        where: { id: string; status?: string; isSystem?: boolean };
      }) => {
        if (where.id !== systemArea.id) return null;
        if (where.status !== undefined && where.status !== systemArea.status) return null;
        if (where.isSystem !== undefined && where.isSystem !== systemArea.isSystem) return null;
        return { id: systemArea.id };
      },
    },
    project: { findFirst: async () => null },
  };

  await assert.rejects(
    resolveVerifiedDestination({ areaId: "system" }, client),
    /Area not found/,
  );
});

test("resolveVerifiedDestination distinguishes a missing Project", async () => {
  const client = {
    area: { findFirst: async () => ({ id: "area-1" }) },
    project: { findFirst: async () => null },
  };

  await assert.rejects(
    resolveVerifiedDestination({ projectId: "missing" }, client),
    /Project not found/,
  );
});
