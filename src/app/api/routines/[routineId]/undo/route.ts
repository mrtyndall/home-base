import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { undoRoutineCompletionById } from "@/lib/routines";

type RouteContext = {
  params: Promise<{ routineId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { routineId } = await context.params;

  try {
    await undoRoutineCompletionById(routineId, { source: "manual" });
  } catch {
    return NextResponse.json({ error: "Routine not found." }, { status: 404 });
  }

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/tasks");

  return NextResponse.json({ ok: true });
}
