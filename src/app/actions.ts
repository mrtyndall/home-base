"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { completeTaskById, createTaskWithAudit } from "@/lib/tasks";

export async function completeTask(formData: FormData) {
  const taskId = formData.get("taskId");
  if (typeof taskId !== "string" || taskId.length === 0) {
    return;
  }

  await completeTaskById(taskId, { source: "manual" });

  revalidatePath("/");
  revalidatePath("/tasks");
}

export async function addSubtask(formData: FormData) {
  const parentTaskId = formData.get("parentTaskId");
  const title = formData.get("title");
  if (
    typeof parentTaskId !== "string" ||
    parentTaskId.length === 0 ||
    typeof title !== "string" ||
    title.trim().length === 0
  ) {
    return;
  }

  const parent = await prisma.task.findUnique({
    where: { id: parentTaskId },
    select: { domainId: true, projectId: true },
  });
  if (!parent) return;

  await createTaskWithAudit(
    {
      title: title.trim(),
      domainId: parent.domainId,
      projectId: parent.projectId,
      parentTaskId,
    },
    { source: "manual" },
  );

  revalidatePath("/");
  revalidatePath("/tasks");
}

export async function parkProject(formData: FormData) {
  const projectId = formData.get("projectId");
  const whereLeftOff = formData.get("whereLeftOff");
  if (typeof projectId !== "string" || projectId.length === 0) return;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      status: "parked",
      parkedAt: new Date(),
      currentState:
        typeof whereLeftOff === "string" && whereLeftOff.trim().length > 0
          ? whereLeftOff.trim()
          : undefined,
    },
  });

  await prisma.projectActivity.create({
    data: {
      projectId,
      entry:
        typeof whereLeftOff === "string" && whereLeftOff.trim().length > 0
          ? `Parked: ${whereLeftOff.trim()}`
          : "Project parked.",
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
      type: "project_parked",
      title: "Project parked",
      body: project.name,
      sourceRef: { type: "project", id: project.id, source: "manual" },
    },
  });

  revalidatePath("/projects");
}

export async function unparkProject(formData: FormData) {
  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId.length === 0) return;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      status: "active",
      parkedAt: null,
    },
  });

  await prisma.projectActivity.create({
    data: {
      projectId,
      entry: "Project unparked.",
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
      type: "project_unparked",
      title: "Project unparked",
      body: project.name,
      sourceRef: { type: "project", id: project.id, source: "manual" },
    },
  });

  revalidatePath("/projects");
}
