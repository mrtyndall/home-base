import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fileRoutine, RoutineFilingError } from "@/lib/routine-filing";

type RouteContext = { params: Promise<{ routineId: string }> };
type Dependencies = { fileRoutine: typeof fileRoutine };

export async function routineInboxFilingResponse(
  routineId: string,
  request: Request,
  dependencies: Dependencies = { fileRoutine },
) {
  const body = await request.json().catch(() => null) as { areaId?: unknown } | null;
  if (!body || !(body.areaId === null || typeof body.areaId === "string")) {
    return NextResponse.json({ error: "Choose a valid Area." }, { status: 400 });
  }
  const areaId = typeof body.areaId === "string" ? body.areaId.trim() || null : null;
  try {
    const routine = await dependencies.fileRoutine(routineId, areaId);
    return NextResponse.json({ entity: { id: routine.id, areaId: routine.areaId } });
  } catch (error) {
    if (error instanceof RoutineFilingError) {
      const message = error.code === "routine_not_found" ? "Routine not found." : "Area not found.";
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: "Routine filing failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { routineId } = await context.params;
  const response = await routineInboxFilingResponse(routineId, request);
  if (response.ok) {
    revalidatePath("/areas/inbox");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath("/today");
  }
  return response;
}
