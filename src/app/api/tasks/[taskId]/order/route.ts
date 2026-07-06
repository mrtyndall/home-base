import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { taskId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    targetTaskId?: unknown;
  };
  const targetTaskId =
    typeof body.targetTaskId === "string" ? body.targetTaskId : "";

  if (!targetTaskId || targetTaskId === taskId) {
    return NextResponse.json({ ok: true });
  }

  const [task, targetTask] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, status: true, parentTaskId: true },
    }),
    prisma.task.findUnique({
      where: { id: targetTaskId },
      select: {
        id: true,
        status: true,
        dueDate: true,
        someday: true,
        parentTaskId: true,
      },
    }),
  ]);

  if (!task || !targetTask || task.status !== "open" || targetTask.status !== "open") {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.parentTaskId !== targetTask.parentTaskId) {
    return NextResponse.json(
      { error: "Tasks can only be reordered inside the same group." },
      { status: 409 },
    );
  }

  const siblings = await prisma.task.findMany({
    where: {
      status: "open",
      dueDate: targetTask.dueDate,
      someday: targetTask.someday,
      parentTaskId: targetTask.parentTaskId,
    },
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const orderedIds = siblings
    .map((sibling) => sibling.id)
    .filter((id) => id !== taskId);
  const targetIndex = orderedIds.indexOf(targetTaskId);
  orderedIds.splice(targetIndex === -1 ? orderedIds.length : targetIndex, 0, taskId);

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.task.update({
        where: { id },
        data: {
          dueDate: targetTask.dueDate,
          someday: targetTask.someday,
          parentTaskId: targetTask.parentTaskId,
          sortOrder: (index + 1) * 1000,
        },
      }),
    ),
  );

  revalidatePath("/tasks");
  revalidatePath("/today");
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
