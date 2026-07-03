"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateOnlyFromString } from "@/lib/dates";
import {
  completeTaskById,
  createTaskWithAudit,
  createTaskWithDefaultDomain,
} from "@/lib/tasks";

export async function completeTask(formData: FormData) {
  const taskId = formData.get("taskId");
  if (typeof taskId !== "string" || taskId.length === 0) {
    return;
  }

  await completeTaskById(taskId, { source: "manual" });

  revalidatePath("/");
  revalidatePath("/tasks");
}

export async function createQuickTask(formData: FormData) {
  const title = getTrimmedString(formData, "title");
  if (!title) return;

  const dueDateValue = getTrimmedString(formData, "dueDate");

  await createTaskWithDefaultDomain(
    {
      title,
      dueDate: dueDateValue ? dateOnlyFromString(dueDateValue) : null,
    },
    { source: "manual" },
  );

  revalidatePath("/");
  revalidatePath("/tasks");
}

export async function updateTaskDetail(formData: FormData) {
  const taskId = getTrimmedString(formData, "taskId");
  if (!taskId) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true },
  });
  if (!task) return;

  const domainId = getTrimmedString(formData, "domainId");
  if (!domainId) return;

  const projectId = getTrimmedString(formData, "projectId");
  const validProject = projectId
    ? await prisma.project.findFirst({
        where: {
          id: projectId,
          domainId,
          status: { in: ["active", "parked"] },
        },
        select: { id: true },
      })
    : null;

  const dueDate = getTrimmedString(formData, "dueDate");
  const dueTime = getTrimmedString(formData, "dueTime");
  const priority = getTrimmedString(formData, "priority");
  const notes = getTrimmedString(formData, "notes");
  const recurrenceRule = getTrimmedString(formData, "recurrenceRule");
  const reminderOffsets = parseReminderOffsetsInput(
    getTrimmedString(formData, "reminderOffsets"),
  );

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      dueDate: dueDate ? dateOnlyFromString(dueDate) : null,
      dueTime: dueTime || null,
      priority: priority || null,
      domainId,
      projectId: validProject?.id ?? null,
      notes: notes || null,
      recurrenceRule: recurrenceRule || null,
      reminderOffsets:
        reminderOffsets.length > 0 ? reminderOffsets : Prisma.JsonNull,
    },
  });

  await prisma.notification.create({
    data: {
      type: "task_updated",
      title: "Task updated",
      body: updated.title,
      sourceRef: { type: "task", id: updated.id, source: "manual" },
    },
  });

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
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
  revalidatePath(`/tasks/${parentTaskId}`);
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
  revalidatePath(`/projects/${projectId}`);
}

function getTrimmedString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseReminderOffsetsInput(value: string) {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .map((item) => Math.trunc(item));
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
  revalidatePath(`/projects/${projectId}`);
}

export async function createProject(formData: FormData) {
  const name = getTrimmedString(formData, "name");
  const domainId = getTrimmedString(formData, "domainId");
  const targetDate = getTrimmedString(formData, "targetDate");
  if (!name || !domainId) return;

  const domain = await prisma.domain.findFirst({
    where: { id: domainId, active: true },
    select: { id: true },
  });
  if (!domain) return;

  const currentState = "Created from Projects.";
  const nextStep = "Define the next physical step.";
  const project = await prisma.project.create({
    data: {
      name,
      domainId: domain.id,
      targetDate: targetDate ? dateOnlyFromString(targetDate) : null,
      currentState,
      nextStep,
      activity: {
        create: {
          entry: "Project created.",
          source: "manual",
          stateSnapshot: {
            status: "active",
            current_state: currentState,
            next_step: nextStep,
          },
        },
      },
    },
  });

  await prisma.notification.create({
    data: {
      type: "project_created",
      title: "Project created",
      body: project.name,
      sourceRef: { type: "project", id: project.id, source: "manual" },
    },
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectState(formData: FormData) {
  const projectId = getTrimmedString(formData, "projectId");
  const currentState = getTrimmedString(formData, "currentState");
  const nextStep = getTrimmedString(formData, "nextStep");
  if (!projectId || !currentState || !nextStep) return;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { currentState, nextStep },
  });

  await prisma.projectActivity.create({
    data: {
      projectId,
      entry: "Project state updated.",
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
      type: "project_updated",
      title: "Project updated",
      body: project.name,
      sourceRef: { type: "project", id: project.id, source: "manual" },
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function completeProject(formData: FormData) {
  await setProjectTerminalStatus(formData, "completed");
}

export async function killProject(formData: FormData) {
  await setProjectTerminalStatus(formData, "killed");
}

async function setProjectTerminalStatus(
  formData: FormData,
  status: "completed" | "killed",
) {
  const projectId = getTrimmedString(formData, "projectId");
  if (!projectId) return;

  const project = await prisma.project.update({
    where: { id: projectId },
    data:
      status === "completed"
        ? { status, completedAt: new Date(), parkedAt: null }
        : { status, killedAt: new Date(), parkedAt: null },
  });

  await prisma.projectActivity.create({
    data: {
      projectId,
      entry: status === "completed" ? "Project completed." : "Project killed.",
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
      title: status === "completed" ? "Project completed" : "Project killed",
      body: project.name,
      sourceRef: { type: "project", id: project.id, source: "manual" },
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect("/projects");
}
