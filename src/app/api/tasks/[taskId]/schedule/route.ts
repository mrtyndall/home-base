import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { dateOnlyFromString } from "@/lib/dates";
import { displayTaskSchedule } from "@/lib/task-quick-edit";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type ScheduleDataClient = {
  task: {
    findUnique(args: unknown): PromiseLike<{
      id: string;
      title: string;
      status: string;
      dueDate: Date | null;
      someday: boolean;
      triagedAt: Date | null;
    } | null>;
    update(args: unknown): PromiseLike<{
      id: string;
      title: string;
      dueDate: Date | null;
      someday: boolean;
    }>;
  };
  notification: {
    create(args: unknown): PromiseLike<unknown>;
  };
};

type ScheduleClient = ScheduleDataClient & {
  $transaction<T>(operation: (client: ScheduleDataClient) => Promise<T>): Promise<T>;
};

export async function taskScheduleResponse(
  taskId: string,
  request: Request,
  client: ScheduleClient = prisma as unknown as ScheduleClient,
) {
  const body = await request.json().catch(() => null);
  const dueDateValue = body?.dueDate;
  const somedayValue = body?.someday === true;

  if (
    dueDateValue !== undefined &&
    dueDateValue !== null &&
    (typeof dueDateValue !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDateValue))
  ) {
    return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
  }

  const task = await client.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true, dueDate: true, someday: true, triagedAt: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  if (task.status !== "open") {
    return NextResponse.json(
      { error: "Only open tasks can be rescheduled." },
      { status: 409 },
    );
  }

  let nextDueDate: Date | null = null;
  if (!somedayValue && dueDateValue) {
    nextDueDate = dateOnlyFromString(dueDateValue);
    if (Number.isNaN(nextDueDate.valueOf()) || nextDueDate.toISOString().slice(0, 10) !== dueDateValue) {
      return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
    }
  }
  const currentDueDate = task.dueDate?.toISOString().slice(0, 10) ?? null;
  if (task.someday === somedayValue && currentDueDate === (somedayValue ? null : dueDateValue ?? null)) {
    return NextResponse.json({
      task: { id: task.id, dueDate: currentDueDate, someday: task.someday },
      displayLabel: displayTaskSchedule({ dueDate: currentDueDate, someday: task.someday }),
    });
  }

  const updated = await client.$transaction(async (transaction) => {
    const nextTask = await transaction.task.update({
      where: { id: task.id },
      data: {
        dueDate: nextDueDate,
        someday: somedayValue ? true : false,
        triagedAt: task.triagedAt ?? new Date(),
      },
    });

    await transaction.notification.create({
      data: {
        type: "task_rescheduled",
        title: "Task rescheduled",
        body: nextTask.title,
        sourceRef: {
          type: "task",
          id: nextTask.id,
          source: "manual",
          dueDate: somedayValue ? null : dueDateValue,
          someday: somedayValue,
        },
      },
    });
    return nextTask;
  });

  const updatedDueDate = updated.dueDate?.toISOString().slice(0, 10) ?? null;
  return NextResponse.json({
    task: {
      id: updated.id,
      dueDate: updatedDueDate,
      someday: updated.someday,
    },
    displayLabel: displayTaskSchedule({ dueDate: updatedDueDate, someday: updated.someday }),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { taskId } = await context.params;
  const response = await taskScheduleResponse(taskId, request);
  if (response.ok) {
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${taskId}`);
  }
  return response;
}
