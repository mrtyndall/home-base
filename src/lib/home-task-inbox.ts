import type { Area, Project, Task } from "@prisma/client";
import { prisma } from "@/lib/db";

export const HOME_TASK_INBOX_LIMIT = 5;

const taskInboxWhere = {
  status: "open" as const,
  someday: false,
  dueDate: null,
  parentTaskId: null,
};

export type HomeTaskInboxRow = Pick<
  Task,
  | "id"
  | "title"
  | "areaId"
  | "projectId"
  | "triagedAt"
  | "dueDate"
  | "someday"
  | "starred"
> & {
  area: Area | null;
  project: Project | null;
};

export type HomeTaskInboxData = {
  totalCount: number;
  newCount: number;
  rows: HomeTaskInboxRow[];
};

export function mergeHomeTaskInboxRows(
  untriaged: HomeTaskInboxRow[],
  triaged: HomeTaskInboxRow[],
  limit: number,
): HomeTaskInboxRow[] {
  return [...untriaged, ...triaged].slice(0, limit);
}

export async function getHomeTaskInbox(
  client = prisma,
): Promise<HomeTaskInboxData> {
  const [totalCount, newCount, untriaged, triaged] = await client.$transaction(
    async (transaction) => Promise.all([
      transaction.task.count({ where: taskInboxWhere }),
      transaction.task.count({ where: { ...taskInboxWhere, triagedAt: null } }),
      transaction.task.findMany({
        where: { ...taskInboxWhere, triagedAt: null },
        include: { area: true, project: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: HOME_TASK_INBOX_LIMIT,
      }),
      transaction.task.findMany({
        where: { ...taskInboxWhere, triagedAt: { not: null } },
        include: { area: true, project: true },
        orderBy: [
          { sortOrder: "asc" },
          { updatedAt: "desc" },
          { createdAt: "desc" },
          { id: "asc" },
        ],
        take: HOME_TASK_INBOX_LIMIT,
      }),
    ]),
    { isolationLevel: "RepeatableRead" },
  );

  return {
    totalCount,
    newCount,
    rows: mergeHomeTaskInboxRows(
      untriaged,
      triaged,
      HOME_TASK_INBOX_LIMIT,
    ),
  };
}
