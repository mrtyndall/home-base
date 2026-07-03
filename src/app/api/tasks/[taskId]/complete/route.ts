import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { completeTaskById } from "@/lib/tasks";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { taskId } = await context.params;

  try {
    await completeTaskById(taskId, { source: "manual" });
  } catch {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);

  return NextResponse.json({ ok: true });
}
