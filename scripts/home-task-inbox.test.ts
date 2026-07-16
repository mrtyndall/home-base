import assert from "node:assert/strict";
import test from "node:test";
import {
  getHomeTaskInbox,
  HOME_TASK_INBOX_LIMIT,
} from "../src/lib/home-task-inbox";

type Fixture = {
  id: string;
  title: string;
  status: "open" | "completed";
  someday: boolean;
  dueDate: Date | null;
  parentTaskId: string | null;
  areaId: string | null;
  projectId: string | null;
  area: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  triagedAt: Date | null;
  starred: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

const date = (value: string) => new Date(value);

function makeFixture(
  id: string,
  overrides: Partial<Fixture> = {},
): Fixture {
  return {
    id,
    title: id,
    status: "open",
    someday: false,
    dueDate: null,
    parentTaskId: null,
    areaId: null,
    projectId: null,
    area: null,
    project: null,
    triagedAt: date("2026-07-01T00:00:00Z"),
    starred: false,
    sortOrder: 0,
    createdAt: date("2026-07-01T00:00:00Z"),
    updatedAt: date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

test("loads exact counts and a deterministic five-row working set", async () => {
  const fixtures = [
    makeFixture("new-1", {
      triagedAt: null,
      createdAt: date("2026-07-10T00:00:00Z"),
    }),
    makeFixture("new-2", {
      triagedAt: null,
      createdAt: date("2026-07-11T00:00:00Z"),
      projectId: "project-1",
      project: { id: "project-1", name: "Kitchen" },
    }),
    makeFixture("sorted-1", { sortOrder: 1 }),
    makeFixture("sorted-2", {
      sortOrder: 2,
      updatedAt: date("2026-07-09T00:00:00Z"),
    }),
    makeFixture("sorted-3", {
      sortOrder: 2,
      updatedAt: date("2026-07-08T00:00:00Z"),
    }),
    makeFixture("sorted-4", { sortOrder: 3 }),
    makeFixture("sorted-5", { sortOrder: 4 }),
    makeFixture("dated", { dueDate: date("2026-07-20T00:00:00Z") }),
    makeFixture("someday", { someday: true }),
    makeFixture("completed", { status: "completed" }),
    makeFixture("subtask", { parentTaskId: "parent-1" }),
  ];
  const seenCounts: unknown[] = [];
  const seenFinds: Array<Record<string, unknown>> = [];

  function matchesWhere(row: Fixture, where: Record<string, unknown>) {
    if (row.status !== where.status) return false;
    if (row.someday !== where.someday) return false;
    if (row.dueDate !== where.dueDate) return false;
    if (row.parentTaskId !== where.parentTaskId) return false;
    if (!("triagedAt" in where)) return true;
    return where.triagedAt === null
      ? row.triagedAt === null
      : row.triagedAt !== null;
  }

  const fakeClient = {
    task: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        seenCounts.push(where);
        return fixtures.filter((row) => matchesWhere(row, where)).length;
      },
      findMany: async (args: Record<string, unknown>) => {
        seenFinds.push(args);
        const where = args.where as Record<string, unknown>;
        const rows = fixtures.filter((row) => matchesWhere(row, where));
        if (where.triagedAt === null) {
          rows.sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime() ||
              left.id.localeCompare(right.id),
          );
        } else {
          rows.sort(
            (left, right) =>
              left.sortOrder - right.sortOrder ||
              right.updatedAt.getTime() - left.updatedAt.getTime() ||
              right.createdAt.getTime() - left.createdAt.getTime() ||
              left.id.localeCompare(right.id),
          );
        }
        return rows.slice(0, args.take as number);
      },
    },
  };

  const result = await getHomeTaskInbox(fakeClient as never);

  assert.equal(HOME_TASK_INBOX_LIMIT, 5);
  assert.equal(result.totalCount, 7);
  assert.equal(result.newCount, 2);
  assert.deepEqual(
    result.rows.map((row) => row.id),
    ["new-2", "new-1", "sorted-1", "sorted-2", "sorted-3"],
  );
  assert.equal(result.rows[0]?.project?.name, "Kitchen");
  assert.deepEqual(seenCounts[0], {
    status: "open",
    someday: false,
    dueDate: null,
    parentTaskId: null,
  });
  assert.deepEqual(seenCounts[1], {
    status: "open",
    someday: false,
    dueDate: null,
    parentTaskId: null,
    triagedAt: null,
  });
  assert.deepEqual(seenFinds, [
    {
      where: {
        status: "open",
        someday: false,
        dueDate: null,
        parentTaskId: null,
        triagedAt: null,
      },
      include: { area: true, project: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 5,
    },
    {
      where: {
        status: "open",
        someday: false,
        dueDate: null,
        parentTaskId: null,
        triagedAt: { not: null },
      },
      include: { area: true, project: true },
      orderBy: [
        { sortOrder: "asc" },
        { updatedAt: "desc" },
        { createdAt: "desc" },
        { id: "asc" },
      ],
      take: 5,
    },
  ]);
  assert.deepEqual(
    result.rows.map((row) => row.id).filter((id) =>
      ["dated", "someday", "completed", "subtask"].includes(id),
    ),
    [],
  );
});

test("propagates task inbox read failures", async () => {
  const readFailure = new Error("read failed");
  const fakeClient = {
    task: {
      count: async () => {
        throw readFailure;
      },
      findMany: async () => [],
    },
  };

  await assert.rejects(getHomeTaskInbox(fakeClient as never), readFailure);
});
