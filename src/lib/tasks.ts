import { Prisma, type Task } from "@prisma/client";
import { RRule } from "rrule";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { APP_TIMEZONE } from "@/lib/dates";
import { prisma } from "@/lib/db";

export type WriteActor = {
  source: "manual" | "capture" | "api" | "scheduler";
  label?: string;
};

export type CreateTaskInput = {
  title: string;
  notes?: string | null;
  dueDate?: Date | null;
  dueTime?: string | null;
  priority?: string | null;
  domainId: string;
  projectId?: string | null;
  parentTaskId?: string | null;
  recurrenceRule?: string | null;
  reminderOffsets?: Prisma.InputJsonValue;
  source?: string | null;
  captureId?: string | null;
};

export type CreateTaskWithDefaultDomainInput = Omit<
  CreateTaskInput,
  "domainId"
> & {
  domainId?: string | null;
};

export async function createTaskWithDefaultDomain(
  input: CreateTaskWithDefaultDomainInput,
  actor: WriteActor,
) {
  const domainId = input.domainId ?? (await getDefaultDomainId());
  if (!domainId) {
    throw new Error("No active domain is available for task creation.");
  }

  return createTaskWithAudit({ ...input, domainId }, actor);
}

export async function createTaskWithAudit(
  input: CreateTaskInput,
  actor: WriteActor,
) {
  const task = await prisma.task.create({
    data: {
      title: input.title,
      notes: input.notes ?? undefined,
      dueDate: input.dueDate ?? undefined,
      dueTime: input.dueTime ?? undefined,
      priority: input.priority ?? undefined,
      domainId: input.domainId,
      projectId: input.projectId ?? undefined,
      parentTaskId: input.parentTaskId ?? undefined,
      recurrenceRule: input.recurrenceRule ?? undefined,
      reminderOffsets: input.reminderOffsets,
      source: formatSource(actor, input.source),
      captureId: input.captureId ?? undefined,
    },
    include: { domain: true, project: true },
  });

  await prisma.notification.create({
    data: {
      type: "task_created",
      title: "Task created",
      body: task.title,
      sourceRef: {
        type: "task",
        id: task.id,
        source: actor.source,
        actor: actor.label ?? null,
      },
    },
  });

  return task;
}

export async function completeTaskById(taskId: string, actor: WriteActor) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { subtasks: { where: { status: "open" } } },
  });

  if (!task) {
    throw new Error("Task not found.");
  }

  if (task.status !== "open") {
    return { completed: task, nextInstance: null };
  }

  const completedAt = new Date();
  const nextDue = getNextRecurrenceDue(task);

  const [completed, nextInstance] = await prisma.$transaction(async (tx) => {
    const completedTask = await tx.task.update({
      where: { id: task.id },
      data: {
        status: "completed",
        completedAt,
      },
    });

    const nextTask = nextDue
      ? await tx.task.create({
          data: {
            title: task.title,
            notes: task.notes,
            status: "open",
            dueDate: nextDue.dueDate,
            dueTime: task.dueTime,
            priority: task.priority,
            domainId: task.domainId,
            projectId: task.projectId,
            parentTaskId: task.parentTaskId,
            recurrenceRule: task.recurrenceRule,
            reminderOffsets: task.reminderOffsets ?? Prisma.JsonNull,
            source: "recurrence",
            captureId: task.captureId,
          },
        })
      : null;

    await tx.notification.create({
      data: {
        type: "task_completed",
        title: "Task completed",
        body: task.title,
        sourceRef: {
          type: "task",
          id: task.id,
          source: actor.source,
          actor: actor.label ?? null,
          nextTaskId: nextTask?.id ?? null,
        },
      },
    });

    return [completedTask, nextTask] as const;
  });

  return { completed, nextInstance };
}

export async function completeTaskByMatch(taskMatch: string, actor: WriteActor) {
  const task = await prisma.task.findFirst({
    where: {
      status: "open",
      title: { contains: taskMatch, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!task) {
    throw new Error(`No open task matched "${taskMatch}".`);
  }

  return completeTaskById(task.id, actor);
}

function getNextRecurrenceDue(task: Task) {
  if (!task.recurrenceRule) {
    return null;
  }

  const anchor = getTaskDueDateTime(task) ?? new Date();
  const parsed = RRule.fromString(task.recurrenceRule);
  const rule = new RRule({ ...parsed.origOptions, dtstart: anchor });
  const next = rule.after(anchor, false);

  if (!next) {
    return null;
  }

  return {
    dueDate: new Date(
      `${formatInTimeZone(next, APP_TIMEZONE, "yyyy-MM-dd")}T00:00:00.000Z`,
    ),
  };
}

async function getDefaultDomainId() {
  const inbox = await prisma.domain.findUnique({
    where: { name: "Inbox" },
    select: { id: true, active: true },
  });
  if (inbox?.active) {
    return inbox.id;
  }

  const fallback = await prisma.domain.findFirst({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  return fallback?.id ?? null;
}

export function getTaskDueDateTime(
  task: Pick<Task, "dueDate" | "dueTime">,
  defaultTime?: string,
) {
  if (!task.dueDate) {
    return null;
  }

  const date = task.dueDate.toISOString().slice(0, 10);
  const time = normalizeTime(task.dueTime ?? defaultTime ?? "00:00");
  return fromZonedTime(`${date}T${time}:00`, APP_TIMEZONE);
}

export function parseReminderOffsets(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "number" && Number.isFinite(item)) {
        return Math.trunc(item);
      }

      if (typeof item === "string") {
        const numeric = Number(item);
        if (Number.isFinite(numeric)) {
          return Math.trunc(numeric);
        }

        const match = item.match(/^(\d+)\s*(m|min|minute|minutes|h|hour|hours)$/i);
        if (match) {
          const amount = Number(match[1]);
          const unit = match[2].toLowerCase();
          return unit.startsWith("h") ? amount * 60 : amount;
        }
      }

      return null;
    })
    .filter((item): item is number => item !== null && item >= 0);
}

export function normalizeTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return "00:00";
  }

  const hours = Math.min(Math.max(Number(match[1]), 0), 23);
  const minutes = Math.min(Math.max(Number(match[2]), 0), 59);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatSource(actor: WriteActor, requestedSource?: string | null) {
  if (actor.source !== "api") {
    return requestedSource ?? actor.source;
  }

  return actor.label ? `api:${actor.label}` : "api";
}
