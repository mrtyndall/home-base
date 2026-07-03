import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  const status = body?.status;
  if (
    status !== "active" &&
    status !== "parked" &&
    status !== "completed" &&
    status !== "killed"
  ) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const now = new Date();
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      status,
      parkedAt: status === "parked" ? now : status === "active" ? null : undefined,
      completedAt: status === "completed" ? now : undefined,
      killedAt: status === "killed" ? now : undefined,
    },
  });

  await prisma.projectActivity.create({
    data: {
      projectId,
      entry:
        status === "active"
          ? "Project activated."
          : status === "parked"
            ? "Project parked."
            : status === "completed"
              ? "Project completed."
              : "Project killed.",
      source: "manual",
      stateSnapshot: {
        status: project.status,
        current_state: project.currentState,
        next_step: project.nextStep,
      },
    },
  });

  await prisma.notification.create({
    data: {
      type: `project_${status}`,
      title:
        status === "active"
          ? "Project activated"
          : status === "parked"
            ? "Project parked"
            : status === "completed"
              ? "Project completed"
              : "Project killed",
      body: project.name,
      sourceRef: { type: "project", id: project.id, source: "manual" },
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);

  return NextResponse.json({ project: { id: project.id, status: project.status } });
}
