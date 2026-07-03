import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { dateOnlyFromString } from "@/lib/dates";
import { createTaskWithDefaultDomain } from "@/lib/tasks";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const dueDate =
    typeof body?.dueDate === "string" && body.dueDate.trim().length > 0
      ? dateOnlyFromString(body.dueDate.trim())
      : null;

  if (!title) {
    return NextResponse.json({ error: "Task title is required." }, { status: 400 });
  }

  const task = await createTaskWithDefaultDomain(
    { title, dueDate },
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
