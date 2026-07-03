import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    starred?: unknown;
  } | null;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, starred: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const starred =
    typeof body?.starred === "boolean" ? body.starred : !task.starred;
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { starred },
  });

  await prisma.notification.create({
    data: {
      type: updated.starred ? "task_starred" : "task_unstarred",
      title: updated.starred ? "Task starred" : "Task unstarred",
      body: updated.title,
      sourceRef: { type: "task", id: updated.id, source: "manual" },
    },
  });

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${task.id}`);

  return NextResponse.json({ task: { id: updated.id, starred: updated.starred } });
}
