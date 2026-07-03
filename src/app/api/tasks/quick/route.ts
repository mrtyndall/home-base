import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { dateOnlyFromString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { createTaskWithDefaultDomain } from "@/lib/tasks";

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

  if (!title) {
    return NextResponse.json({ error: "Task title is required." }, { status: 400 });
  }

  const project = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, status: { in: ["active", "parked"] } },
        select: { id: true, domainId: true },
      })
    : null;

  const task = await createTaskWithDefaultDomain(
    { title, dueDate, domainId: project?.domainId, projectId: project?.id },
    { source: "manual" },
  );

  revalidatePath("/");
  revalidatePath("/tasks");

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      domainName: task.domain.name,
      projectName: task.project?.name ?? null,
      dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
    },
  });
}
