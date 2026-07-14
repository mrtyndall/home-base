import assert from "node:assert/strict";
import test from "node:test";

import { listTasksForApi } from "../src/app/api/v1/[...path]/route";

type TaskRow = {
  id: string;
  title: string;
  status: "open";
  dueDate: Date;
  createdAt: Date;
  starred: boolean;
};

function paginationClient(rows: TaskRow[]) {
  let requestNumber = 0;
  return {
    task: {
      async findFirst({ where }: { where: { id?: string } }) {
        return rows.find((row) => row.id === where.id) ?? null;
      },
      async findMany({ take, cursor, skip, orderBy }: {
        take: number;
        cursor?: { id: string };
        skip?: number;
        orderBy: Array<Record<string, unknown>>;
      }) {
        requestNumber += 1;
        const hasIdTieBreaker = orderBy.some((item) => item.id === "desc");
        const ordered = [...rows].sort((left, right) => {
          if (hasIdTieBreaker) return right.id.localeCompare(left.id);
          // Model a database choosing a different legal order for equal sort keys.
          return requestNumber % 2 === 1
            ? right.id.localeCompare(left.id)
            : left.id.localeCompare(right.id);
        });
        const start = cursor
          ? ordered.findIndex((row) => row.id === cursor.id) + (skip ?? 0)
          : 0;
        return ordered.slice(start, start + take);
      },
    },
  };
}

test("task cursor pagination visits more than 100 equal-sort tasks exactly once", async () => {
  const sharedDate = new Date("2026-07-14T12:00:00.000Z");
  const rows = Array.from({ length: 237 }, (_, index): TaskRow => ({
    id: `task-${String(index).padStart(3, "0")}`,
    title: "Exact shared title",
    status: "open",
    dueDate: sharedDate,
    createdAt: sharedDate,
    starred: false,
  }));
  const client = paginationClient(rows);
  const visited: string[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await listTasksForApi(
      { q: "Exact shared title", view: "open", limit: 100, cursor },
      client as never,
    );
    visited.push(...page.map((task) => task.id));
    const nextCursor = page.at(-1)?.id;
    if (!nextCursor || page.length < 100) break;
    assert.equal(cursors.has(nextCursor), false, "the server must not repeat a cursor");
    cursors.add(nextCursor);
    cursor = nextCursor;
  } while (true);

  assert.equal(visited.length, rows.length);
  assert.equal(new Set(visited).size, rows.length);
  assert.deepEqual(new Set(visited), new Set(rows.map((row) => row.id)));
});

test("task pagination rejects a cursor missing from the active filter", async () => {
  const client = paginationClient([]);
  await assert.rejects(
    listTasksForApi({ view: "open", limit: 100, cursor: "missing" }, client as never),
    /cursor/i,
  );
});

test("task pagination rejects a repeated cursor returned by its data source", async () => {
  const client = {
    task: {
      findFirst: async () => ({ id: "task-100" }),
      findMany: async () => [{ id: "task-100" }],
    },
  };
  await assert.rejects(
    listTasksForApi({ limit: 100, cursor: "task-100" }, client as never),
    /repeated/i,
  );
});
