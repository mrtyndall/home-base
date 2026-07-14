import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveVerifiedDestination } from "@/lib/destinations";
import { flattenAreaOptions } from "@/lib/hierarchy";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type AssignmentClient = {
  task: {
    findUnique(args: unknown): PromiseLike<{ id: string; title: string; status: string } | null>;
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
      status: "active";
      isSystem: false;
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

  const updated = await client.task.update({
    where: { id: task.id },
    data: {
      areaId: destination.areaId,
      projectId: destination.projectId,
    },
  });

  await client.notification.create({
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

  let displayLabel = "Inbox";
  if (destination.areaId) {
    const areas = await client.area.findMany({
      where: { status: "active", isSystem: false },
      select: {
        id: true,
        name: true,
        parentAreaId: true,
        sortOrder: true,
        status: true,
        isSystem: true,
      },
    });
    const areaPath = flattenAreaOptions(areas).find((area) => area.id === destination.areaId)?.path;
    displayLabel = project
      ? `${project.name} — ${areaPath ?? "No area yet"}`
      : (areaPath ?? "Inbox");
  } else if (project) {
    displayLabel = `${project.name} — No area yet`;
  }

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
