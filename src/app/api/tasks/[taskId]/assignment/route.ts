import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveVerifiedDestination } from "@/lib/destinations";
import { flattenAreaOptions } from "@/lib/hierarchy";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type AssignmentDataClient = {
  task: {
    findUnique(args: unknown): PromiseLike<{
      id: string;
      title: string;
      status: string;
      areaId: string | null;
      projectId: string | null;
    } | null>;
    update(args: unknown): PromiseLike<{
      id: string;
      title: string;
      areaId: string | null;
      projectId: string | null;
    }>;
  };
  area: {
    findFirst(args: unknown): PromiseLike<{ id: string } | null>;
    findMany(args: unknown): PromiseLike<Array<{
      id: string;
      name: string;
      parentAreaId: string | null;
      sortOrder: number;
    }>>;
  };
  project: {
    findFirst(args: unknown): PromiseLike<{
      id: string;
      name: string;
      areaId: string | null;
    } | null>;
  };
  notification: {
    create(args: unknown): PromiseLike<unknown>;
  };
};

type AssignmentClient = AssignmentDataClient & {
  $transaction<T>(operation: (client: AssignmentDataClient) => Promise<T>): Promise<T>;
};

export async function taskAssignmentResponse(
  taskId: string,
  request: Request,
  client: AssignmentClient = prisma as unknown as AssignmentClient,
) {
  const body = (await request.json().catch(() => null)) as {
    areaId?: unknown;
    projectId?: unknown;
  } | null;

  let areaId = typeof body?.areaId === "string" ? body.areaId : null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;

  const task = await client.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true, areaId: true, projectId: true },
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
    ? await client.project.findFirst({
        where: {
          id: projectId,
          status: { in: ["active", "parked", "someday"] },
          OR: [
            { areaId: null },
            { area: { is: { status: "active", isSystem: false } } },
          ],
        },
        select: { id: true, name: true, areaId: true },
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
    destination = await resolveVerifiedDestination({ areaId, projectId }, client);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Destination not found." },
      { status: 404 },
    );
  }

  let displayLabel = "Inbox";
  if (destination.areaId) {
    const areas = await client.area.findMany({
      where: { isSystem: false },
      select: {
        id: true,
        name: true,
        parentAreaId: true,
        sortOrder: true,
      },
    });
    const areaPath = flattenAreaOptions(areas).find((area) => area.id === destination.areaId)?.path;
    displayLabel = project
      ? `${project.name} — ${areaPath ?? "No area yet"}`
      : (areaPath ?? "Inbox");
  } else if (project) {
    displayLabel = `${project.name} — No area yet`;
  }

  if (task.areaId === destination.areaId && task.projectId === destination.projectId) {
    return NextResponse.json({
      task: {
        id: task.id,
        areaId: task.areaId,
        projectId: task.projectId,
      },
      displayLabel,
    });
  }

  const updated = await client.$transaction(async (transaction) => {
    const nextTask = await transaction.task.update({
      where: { id: task.id },
      data: {
        areaId: destination.areaId,
        projectId: destination.projectId,
      },
    });

    await transaction.notification.create({
      data: {
        type: "task_assigned",
        title: "Task assigned",
        body: nextTask.title,
        sourceRef: {
          type: "task",
          id: nextTask.id,
          source: "manual",
          areaId: nextTask.areaId,
          projectId: nextTask.projectId,
        },
      },
    });
    return nextTask;
  });

  return NextResponse.json({
    task: {
      id: updated.id,
      areaId: updated.areaId,
      projectId: updated.projectId,
    },
    displayLabel,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { taskId } = await context.params;
  const response = await taskAssignmentResponse(taskId, request);
  if (response.ok) {
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${taskId}`);
  }
  return response;
}
