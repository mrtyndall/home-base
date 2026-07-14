import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fileProject, ProjectMutationValidationError } from "@/lib/hierarchy";

type RouteContext = { params: Promise<{ projectId: string }> };
type Dependencies = { fileProject: typeof fileProject };

export async function projectInboxFilingResponse(
  projectId: string,
  request: Request,
  dependencies: Dependencies = { fileProject },
) {
  const body = await request.json().catch(() => null) as { areaId?: unknown } | null;
  if (!body || !(body.areaId === null || typeof body.areaId === "string")) {
    return NextResponse.json({ error: "Choose a valid Area." }, { status: 400 });
  }
  const areaId = typeof body.areaId === "string" ? body.areaId.trim() || null : null;
  try {
    const project = await dependencies.fileProject(projectId, areaId);
    return NextResponse.json({ entity: { id: project.id, areaId: project.areaId } });
  } catch (error) {
    if (error instanceof ProjectMutationValidationError) {
      const message = error.code === "project_not_found" ? "Project not found." : "Area not found.";
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: "Project filing failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const response = await projectInboxFilingResponse(projectId, request);
  if (response.ok) {
    revalidatePath("/projects");
    revalidatePath("/areas/inbox");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/areas/[areaId]", "page");
  }
  return response;
}
