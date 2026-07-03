"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CreatedItemRef } from "@/lib/capture/types";
import { dateOnlyFromString } from "@/lib/dates";
import {
  completeTaskById,
  createTaskWithAudit,
  createTaskWithDefaultArea,
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
  const projectId = getTrimmedString(formData, "projectId");
  const selectedAreaId = getTrimmedString(formData, "areaId");
  const project = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, status: { in: ["active", "parked", "someday"] } },
        select: { id: true, areaId: true },
      })
    : null;
  const area = !project && selectedAreaId
    ? await prisma.area.findFirst({
        where: { id: selectedAreaId, status: "active" },
        select: { id: true },
      })
    : null;

  await createTaskWithDefaultArea(
    {
      title,
      dueDate: dueDateValue ? dateOnlyFromString(dueDateValue) : null,
      areaId: project?.areaId ?? area?.id,
      projectId: project?.id,
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

  const areaId = getTrimmedString(formData, "areaId");
  if (!areaId) return;

  const projectId = getTrimmedString(formData, "projectId");
  const validProject = projectId
    ? await prisma.project.findFirst({
        where: {
          id: projectId,
          areaId,
          status: { in: ["active", "parked", "someday"] },
        },
        select: { id: true, areaId: true },
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
      areaId: validProject?.areaId ?? areaId,
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
    select: { areaId: true, projectId: true },
  });
  if (!parent) return;

  await createTaskWithAudit(
    {
      title: title.trim(),
      areaId: parent.areaId,
      projectId: parent.projectId,
      parentTaskId,
    },
    { source: "manual" },
  );

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${parentTaskId}`);
}

export async function addProjectTask(formData: FormData) {
  const projectId = getTrimmedString(formData, "projectId");
  const title = getTrimmedString(formData, "title");
  if (!projectId || !title) return;

  const project = await prisma.project.findFirst({
    where: { id: projectId, status: { in: ["active", "parked", "someday"] } },
    select: { id: true, areaId: true },
  });
  if (!project) return;

  await createTaskWithAudit(
    {
      title,
      areaId: project.areaId,
      projectId: project.id,
    },
    { source: "manual" },
  );

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/projects/${project.id}`);
}

export async function parkProject(formData: FormData) {
  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId.length === 0) return;
  await parkProjectById(projectId);
}

export async function parkProjectById(projectId: string) {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      status: "parked",
      parkedAt: new Date(),
    },
  });

  await prisma.projectActivity.create({
    data: {
      projectId,
      entry: "Project parked.",
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

function normalizeCreatedItems(value: Prisma.JsonValue | null): CreatedItemRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CreatedItemRef => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return false;
    }
    return (
      "type" in item &&
      typeof item.type === "string" &&
      "id" in item &&
      typeof item.id === "string" &&
      "label" in item &&
      typeof item.label === "string"
    );
  });
}

export async function unparkProject(formData: FormData) {
  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId.length === 0) return;
  await unparkProjectById(projectId);
}

export async function unparkProjectById(projectId: string) {
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

export async function activateProject(formData: FormData) {
  const projectId = getTrimmedString(formData, "projectId");
  if (!projectId) return;
  await activateProjectById(projectId);
}

export async function activateProjectById(projectId: string) {
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
      entry: "Project activated.",
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
      type: "project_activated",
      title: "Project activated",
      body: project.name,
      sourceRef: { type: "project", id: project.id, source: "manual" },
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

export async function createProject(formData: FormData) {
  const name = getTrimmedString(formData, "name");
  const areaId = getTrimmedString(formData, "areaId");
  const targetDate = getTrimmedString(formData, "targetDate");
  const startMode = getTrimmedString(formData, "startMode");
  if (!name || !areaId) return;

  const area = await prisma.area.findFirst({
    where: { id: areaId, status: "active" },
    select: { id: true },
  });
  if (!area) return;

  const project = await prisma.project.create({
    data: {
      name,
      areaId: area.id,
      status: startMode === "someday" ? "someday" : "active",
      targetDate: targetDate ? dateOnlyFromString(targetDate) : null,
      activity: {
        create: {
          entry: "Project created.",
          source: "manual",
          stateSnapshot: {
            status: startMode === "someday" ? "someday" : "active",
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
  if (!projectId) return;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      currentState: currentState || null,
      nextStep: nextStep || null,
    },
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

export async function updateProjectTimeframe(formData: FormData) {
  const projectId = getTrimmedString(formData, "projectId");
  const targetDate = getTrimmedString(formData, "targetDate");
  const openEnded = formData.get("openEnded") === "on";
  if (!projectId) return;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      targetDate: openEnded || !targetDate ? null : dateOnlyFromString(targetDate),
    },
  });

  await prisma.projectActivity.create({
    data: {
      projectId,
      entry: project.targetDate
        ? `Project timeframe set to ${project.targetDate.toISOString().slice(0, 10)}.`
        : "Project set as open ended.",
      source: "manual",
      stateSnapshot: {
        status: project.status,
        target_date: project.targetDate?.toISOString().slice(0, 10) ?? null,
      },
    },
  });

  await prisma.notification.create({
    data: {
      type: "project_timeframe_updated",
      title: "Project timeframe updated",
      body: project.targetDate
        ? `Target ${project.targetDate.toISOString().slice(0, 10)}`
        : "Open ended",
      sourceRef: { type: "project", id: project.id, source: "manual" },
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function updateAreaState(formData: FormData) {
  const areaId = getTrimmedString(formData, "areaId");
  const currentState = getTrimmedString(formData, "currentState");
  const nextStep = getTrimmedString(formData, "nextStep");
  if (!areaId) return;

  const area = await prisma.area.update({
    where: { id: areaId },
    data: {
      currentState: currentState || null,
      nextStep: nextStep || null,
    },
  });

  await prisma.entityNote.create({
    data: {
      parentType: "area",
      parentId: area.id,
      bodyMd: "Area state updated.",
      source: "manual",
    },
  });

  await prisma.notification.create({
    data: {
      type: "area_updated",
      title: "Area updated",
      body: area.name,
      sourceRef: { type: "area", id: area.id, source: "manual" },
    },
  });

  revalidatePath(`/areas/${areaId}`);
  redirect(`/areas/${areaId}`);
}

export async function addEntityNote(formData: FormData) {
  const parentType = getTrimmedString(formData, "parentType");
  const parentId = getTrimmedString(formData, "parentId");
  const bodyMd = getTrimmedString(formData, "bodyMd");
  if ((parentType !== "area" && parentType !== "project") || !parentId || !bodyMd) {
    return;
  }

  await prisma.entityNote.create({
    data: {
      parentType,
      parentId,
      bodyMd,
      source: "manual",
    },
  });

  revalidateEntityParent(parentType, parentId);
}

export async function convertPendingCapture(formData: FormData) {
  const captureId = getTrimmedString(formData, "captureId");
  const areaId = getTrimmedString(formData, "areaId");
  const targetType = getTrimmedString(formData, "targetType");
  if (
    !captureId ||
    !areaId ||
    (targetType !== "task" &&
      targetType !== "idea" &&
      targetType !== "note" &&
      targetType !== "reference")
  ) {
    return;
  }

  const [capture, area] = await Promise.all([
    prisma.capture.findUnique({ where: { id: captureId } }),
    prisma.area.findFirst({
      where: { id: areaId, status: "active" },
      include: { domain: true },
    }),
  ]);
  if (!capture || !area) return;

  let item: CreatedItemRef;
  if (targetType === "task") {
    const task = await createTaskWithAudit(
      {
        title: capture.rawText,
        areaId: area.id,
        captureId: capture.id,
        source: "manual",
      },
      { source: "manual" },
    );
    item = { type: "task", id: task.id, label: `Task added to ${area.name}` };
  } else if (targetType === "idea") {
    const idea = await prisma.idea.create({
      data: {
        title: capture.rawText,
        body: capture.rawText,
        areaId: area.id,
        source: "manual",
        captureId: capture.id,
      },
    });
    item = { type: "idea", id: idea.id, label: `Idea saved to ${area.name}` };
  } else if (targetType === "note") {
    const note = await prisma.entityNote.create({
      data: {
        parentType: "area",
        parentId: area.id,
        bodyMd: capture.rawText,
        source: "manual",
        captureId: capture.id,
      },
    });
    item = { type: "entity_note", id: note.id, label: `Note added to ${area.name}` };
  } else {
    const reference = await prisma.reference.create({
      data: {
        body: capture.rawText,
        areaId: area.id,
        source: "manual",
        captureId: capture.id,
      },
    });
    item = {
      type: "reference",
      id: reference.id,
      label: `Reference saved to ${area.name}`,
    };
  }

  const existingItems = normalizeCreatedItems(capture.createdItems);
  await prisma.capture.update({
    where: { id: capture.id },
    data: {
      parseStatus: "parsed",
      createdItems: [
        ...existingItems.filter((existing) => existing.type !== "pending_capture"),
        item,
      ] as Prisma.InputJsonValue,
    },
  });

  await prisma.notification.create({
    data: {
      type: "capture_converted",
      title: "Capture converted",
      body: item.label,
      sourceRef: {
        type: "capture",
        id: capture.id,
        source: "manual",
        createdType: item.type,
        createdId: item.id,
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/search");
  revalidatePath(`/areas/${area.id}`);
  revalidatePath("/areas/area_inbox");
}

export async function createEntityDoc(formData: FormData) {
  const parentType = getTrimmedString(formData, "parentType");
  const parentId = getTrimmedString(formData, "parentId");
  const title = getTrimmedString(formData, "title");
  const bodyMd = getTrimmedString(formData, "bodyMd");
  if (
    (parentType !== "area" && parentType !== "project") ||
    !parentId ||
    !title ||
    !bodyMd
  ) {
    return;
  }

  await prisma.entityDoc.create({
    data: {
      parentType,
      parentId,
      title,
      bodyMd,
      source: "manual",
    },
  });

  revalidateEntityParent(parentType, parentId);
}

export async function importEntityDocMarkdown(formData: FormData) {
  const parentType = getTrimmedString(formData, "parentType");
  const parentId = getTrimmedString(formData, "parentId");
  const file = formData.get("markdownFile");
  if (
    (parentType !== "area" && parentType !== "project") ||
    !parentId ||
    !(file instanceof File) ||
    file.size === 0
  ) {
    return;
  }

  const bodyMd = await file.text();
  const fallbackTitle = file.name.replace(/\.(md|markdown|txt)$/i, "").trim();
  const title = getTrimmedString(formData, "title") || fallbackTitle || "Imported doc";

  await prisma.entityDoc.create({
    data: {
      parentType,
      parentId,
      title,
      bodyMd,
      source: "manual",
    },
  });

  revalidateEntityParent(parentType, parentId);
}

export async function updateEntityDoc(formData: FormData) {
  const docId = getTrimmedString(formData, "docId");
  const title = getTrimmedString(formData, "title");
  const bodyMd = getTrimmedString(formData, "bodyMd");
  if (!docId || !title || !bodyMd) return;

  const doc = await prisma.entityDoc.update({
    where: { id: docId },
    data: { title, bodyMd },
  });

  revalidateEntityParent(doc.parentType, doc.parentId);
}

export async function archiveEntityDoc(formData: FormData) {
  const docId = getTrimmedString(formData, "docId");
  if (!docId) return;

  const doc = await prisma.entityDoc.update({
    where: { id: docId },
    data: { status: "archived" },
  });

  revalidateEntityParent(doc.parentType, doc.parentId);
}

export async function addMilestone(formData: FormData) {
  const projectId = getTrimmedString(formData, "projectId");
  const title = getTrimmedString(formData, "title");
  if (!projectId || !title) return;

  const last = await prisma.milestone.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.milestone.create({
    data: {
      projectId,
      title,
      sortOrder: (last?.sortOrder ?? 0) + 10,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function completeMilestone(formData: FormData) {
  const milestoneId = getTrimmedString(formData, "milestoneId");
  if (!milestoneId) return;

  const milestone = await prisma.milestone.update({
    where: { id: milestoneId },
    data: { status: "completed", completedAt: new Date() },
  });

  revalidatePath(`/projects/${milestone.projectId}`);
}

export async function moveMilestone(formData: FormData) {
  const milestoneId = getTrimmedString(formData, "milestoneId");
  const direction = getTrimmedString(formData, "direction");
  if (!milestoneId || (direction !== "up" && direction !== "down")) return;

  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
  });
  if (!milestone) return;

  const sibling = await prisma.milestone.findFirst({
    where: {
      projectId: milestone.projectId,
      status: "open",
      sortOrder:
        direction === "up"
          ? { lt: milestone.sortOrder }
          : { gt: milestone.sortOrder },
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!sibling) return;

  await prisma.$transaction([
    prisma.milestone.update({
      where: { id: milestone.id },
      data: { sortOrder: sibling.sortOrder },
    }),
    prisma.milestone.update({
      where: { id: sibling.id },
      data: { sortOrder: milestone.sortOrder },
    }),
  ]);

  revalidatePath(`/projects/${milestone.projectId}`);
}

function revalidateEntityParent(parentType: "area" | "project", parentId: string) {
  revalidatePath(parentType === "area" ? `/areas/${parentId}` : `/projects/${parentId}`);
}

export async function parkArea(formData: FormData) {
  const areaId = getTrimmedString(formData, "areaId");
  if (!areaId) return;
  await setAreaStatusById(areaId, "parked");
}

export async function unparkArea(formData: FormData) {
  const areaId = getTrimmedString(formData, "areaId");
  if (!areaId) return;
  await setAreaStatusById(areaId, "active");
}

export async function retireArea(formData: FormData) {
  const areaId = getTrimmedString(formData, "areaId");
  if (!areaId) return;
  await setAreaStatusById(areaId, "retired");
}

export async function parkAreaById(areaId: string) {
  await setAreaStatusById(areaId, "parked");
}

export async function unparkAreaById(areaId: string) {
  await setAreaStatusById(areaId, "active");
}

export async function retireAreaById(areaId: string) {
  await setAreaStatusById(areaId, "retired");
}

async function setAreaStatusById(
  areaId: string,
  status: "active" | "parked" | "retired",
) {
  const area = await prisma.area.update({
    where: { id: areaId },
    data: { status },
  });

  await prisma.entityNote.create({
    data: {
      parentType: "area",
      parentId: area.id,
      bodyMd: `Area status changed to ${status}.`,
      source: "manual",
    },
  });

  await prisma.notification.create({
    data: {
      type: `area_${status}`,
      title: status === "active" ? "Area active" : status === "parked" ? "Area parked" : "Area retired",
      body: area.name,
      sourceRef: { type: "area", id: area.id, source: "manual" },
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/areas/${areaId}`);
}

export async function completeProject(formData: FormData) {
  const projectId = getTrimmedString(formData, "projectId");
  if (!projectId) return;
  await setProjectTerminalStatusById(projectId, "completed");
}

export async function killProject(formData: FormData) {
  const projectId = getTrimmedString(formData, "projectId");
  if (!projectId) return;
  await setProjectTerminalStatusById(projectId, "killed");
}

export async function completeProjectById(projectId: string) {
  await setProjectTerminalStatusById(projectId, "completed");
}

export async function killProjectById(projectId: string) {
  await setProjectTerminalStatusById(projectId, "killed");
}

async function setProjectTerminalStatusById(
  projectId: string,
  status: "completed" | "killed",
) {
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
