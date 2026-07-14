import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { dateOnlyFromString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { createTask } from "@/lib/tasks";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const dueDate =
    typeof body?.dueDate === "string" && body.dueDate.trim().length > 0
      ? dateOnlyFromString(body.dueDate.trim())
      : null;
  const projectId =
    typeof body?.projectId === "string" && body.projectId.trim().length > 0
      ? body.projectId.trim()
      : null;
  const areaId =
    typeof body?.areaId === "string" && body.areaId.trim().length > 0
      ? body.areaId.trim()
      : null;

  if (!title) {
    return NextResponse.json({ error: "Task title is required." }, { status: 400 });
  }

  const project = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, status: { in: ["active", "parked", "someday"] } },
        select: { id: true, areaId: true },
      })
    : null;
  if (projectId && !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const area = !project && areaId
    ? await prisma.area.findFirst({
        where: { id: areaId, status: "active" },
        select: { id: true },
      })
    : null;
  if (areaId && !project && !area) {
    return NextResponse.json({ error: "Area not found." }, { status: 404 });
  }

  const task = await createTask(
    { title, dueDate, areaId: project?.areaId ?? area?.id, projectId: project?.id },
    { source: "manual" },
  );

  revalidatePath("/");
  revalidatePath("/tasks");

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      areaName: task.area?.name ?? null,
      projectName: task.project?.name ?? null,
      dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
    },
  });
}
