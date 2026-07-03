import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { dateOnlyFromString } from "@/lib/dates";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { taskId } = await context.params;
  const body = await request.json().catch(() => null);
  const dueDateValue = body?.dueDate;

  if (
    dueDateValue !== null &&
    (typeof dueDateValue !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDateValue))
  ) {
    return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true, dueDate: true },
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

  const nextDueDate = dueDateValue ? dateOnlyFromString(dueDateValue) : null;
  const currentDueDate = task.dueDate?.toISOString().slice(0, 10) ?? null;
  if (currentDueDate === dueDateValue) {
    return NextResponse.json({
      task: { id: task.id, dueDate: currentDueDate },
    });
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { dueDate: nextDueDate },
  });

  await prisma.notification.create({
    data: {
      type: "task_rescheduled",
      title: "Task rescheduled",
      body: updated.title,
      sourceRef: {
        type: "task",
        id: updated.id,
        source: "manual",
        dueDate: dueDateValue,
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${task.id}`);

  return NextResponse.json({
    task: {
      id: updated.id,
      dueDate: updated.dueDate?.toISOString().slice(0, 10) ?? null,
    },
  });
}
