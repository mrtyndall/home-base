import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveVerifiedDestination } from "@/lib/destinations";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    areaId?: unknown;
    projectId?: unknown;
  } | null;

  let areaId = typeof body?.areaId === "string" ? body.areaId : null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  if (task.status !== "open") {
    return NextResponse.json(
      { error: "Only open tasks can be reassigned." },
      { status: 409 },
    );
  }

  const project = projectId
    ? await prisma.project.findFirst({
        where: {
          id: projectId,
          status: { in: ["active", "parked", "someday"] },
          area: { is: { status: "active", isSystem: false } },
        },
        select: { id: true, areaId: true },
      })
    : null;
  if (projectId && !project) {
    return NextResponse.json(
      { error: "Project not found or unavailable." },
      { status: 404 },
    );
  }
  if (project) areaId = project.areaId;
  let destination;
  try {
    destination = await resolveVerifiedDestination({ areaId, projectId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Destination not found." },
      { status: 404 },
    );
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      areaId: destination.areaId,
      projectId: destination.projectId,
    },
  });

  await prisma.notification.create({
    data: {
      type: "task_assigned",
      title: "Task assigned",
      body: updated.title,
      sourceRef: {
        type: "task",
        id: updated.id,
        source: "manual",
        areaId: updated.areaId,
        projectId: updated.projectId,
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${task.id}`);

  return NextResponse.json({
    task: {
      id: updated.id,
      areaId: updated.areaId,
      projectId: updated.projectId,
    },
  });
}
