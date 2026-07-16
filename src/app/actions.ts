"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Prisma, type EntityParentType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordCaptureRoutingFeedback } from "@/lib/agent/sorter";
import { createCompatibleArea } from "@/lib/area-compat";
import { fileProject, updateAreaWithValidatedParent } from "@/lib/hierarchy";
import { resolveVerifiedDestination } from "@/lib/destinations";
import {
  createReadLater,
  normalizeReadLaterUrl,
  setReadLaterStatus,
  type ReadLaterFilingIntent,
  type ReadLaterStatus,
} from "@/lib/read-later";
import {
  performReadLaterFilingMutation,
  performReadLaterStatusMutation,
  type ReadLaterMutationResult,
} from "@/lib/read-later-action-service";
import { syncBookLoreSnippetsForReference } from "@/lib/booklore-snippets";
import type { CreatedItemRef } from "@/lib/capture/types";
import { dateOnlyFromString } from "@/lib/dates";
import { normalizeJournalUpdateInput } from "@/lib/journal";
import { syncReferenceMentions } from "@/lib/reference-mentions";
import { completeRoutineById, undoRoutineCompletionById } from "@/lib/routines";
import {
  completeTaskById,
  createTask,
  createTaskWithAudit,
} from "@/lib/tasks";

export async function completeRoutine(formData: FormData) {
  const routineId = formData.get("routineId");
  if (typeof routineId !== "string" || routineId.length === 0) {
    return;
  }

  try {
    await completeRoutineById(routineId, { source: "manual" });
  } catch {
    return;
  }

  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function undoRoutineCompletion(formData: FormData) {
  const routineId = formData.get("routineId");
  if (typeof routineId !== "string" || routineId.length === 0) {
    return;
  }

  try {
    await undoRoutineCompletionById(routineId, { source: "manual" });
  } catch {
    return;
  }

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/tasks");
}

export async function completeTask(formData: FormData) {
  const taskId = formData.get("taskId");
  if (typeof taskId !== "string" || taskId.length === 0) {
    return;
  }

  await completeTaskById(taskId, { source: "manual" });

  revalidatePath("/");
  revalidatePath("/tasks");
}

export async function toggleTaskStar(formData: FormData) {
  const taskId = getTrimmedString(formData, "taskId");
  if (!taskId) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, starred: true },
  });
  if (!task) return;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { starred: !task.starred },
  });

  await prisma.notification.create({
    data: {
      type: updated.starred ? "task_starred" : "task_unstarred",
      title: updated.starred ? "Task starred" : "Task unstarred",
      body: updated.title,
      sourceRef: { type: "task", id: updated.id, source: "manual" },
    },
  });

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function createQuickTask(formData: FormData) {
  const title = getTrimmedString(formData, "title");
  if (!title) return;

  const dueDateValue = getTrimmedString(formData, "dueDate");
  const projectId = getTrimmedString(formData, "projectId");
  const selectedAreaId = getTrimmedString(formData, "areaId");
  const project = projectId
    ? await prisma.project.findFirst({
        where: {
          id: projectId,
          status: { in: ["active", "parked", "someday"] },
        },
        select: { id: true, areaId: true },
      })
    : null;
  if (projectId && !project) return;
  const area =
    !project && selectedAreaId
      ? await prisma.area.findFirst({
          where: { id: selectedAreaId, status: "active" },
          select: { id: true },
        })
      : null;
  if (selectedAreaId && !project && !area) return;

  await createTask(
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
    select: {
      id: true,
      title: true,
      dueDate: true,
      someday: true,
      areaId: true,
      projectId: true,
      triagedAt: true,
    },
  });
  if (!task) return;

  const areaId = getTrimmedString(formData, "areaId") || null;

  const projectId = getTrimmedString(formData, "projectId");
  const validProject = projectId
    ? await prisma.project.findFirst({
        where: {
          id: projectId,
          status: { in: ["active", "parked", "someday"] },
        },
        select: { id: true, areaId: true },
      })
    : null;
  if (projectId && !validProject) return;

  const dueDate = getTrimmedString(formData, "dueDate");
  const dueTime = getTrimmedString(formData, "dueTime");
  const priority = getTrimmedString(formData, "priority");
  const notes = getTrimmedString(formData, "notes");
  const tags = parseTagsInput(getTrimmedString(formData, "labels"));
  const recurrenceRule = getTrimmedString(formData, "recurrenceRule");
  const reminderOffsets = parseReminderOffsetsInput(
    getTrimmedString(formData, "reminderOffsets"),
  );

  const destination = await resolveVerifiedDestination({
    areaId: validProject?.areaId ?? areaId,
    projectId: validProject?.id,
  });
  const nextDueDate = dueDate ? dateOnlyFromString(dueDate) : null;
  const nextSomeday = task.someday;
  const triageStateChanged =
    task.dueDate?.getTime() !== nextDueDate?.getTime() ||
    task.someday !== nextSomeday ||
    task.areaId !== destination.areaId ||
    task.projectId !== destination.projectId;
  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      dueDate: nextDueDate,
      dueTime: dueTime || null,
      priority: priority || null,
      areaId: destination.areaId,
      projectId: destination.projectId,
      triagedAt: triageStateChanged ? (task.triagedAt ?? new Date()) : undefined,
      notes: notes || null,
      tags,
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

export async function setEntityNoteStarred(formData: FormData) {
  const noteId = getTrimmedString(formData, "noteId");
  const nextValue = getTrimmedString(formData, "starred") === "true";
  if (!noteId) return;

  const note = await prisma.entityNote.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      parentType: true,
      parentId: true,
      bodyMd: true,
      starredAt: true,
    },
  });
  if (!note) return;

  const shouldChange = nextValue ? !note.starredAt : Boolean(note.starredAt);
  if (!shouldChange) return;

  const updated = await prisma.entityNote.update({
    where: { id: noteId },
    data: { starredAt: nextValue ? new Date() : null },
  });

  await prisma.notification.create({
    data: {
      type: nextValue ? "note_starred" : "note_unstarred",
      title: nextValue ? "Note starred" : "Note unstarred",
      body:
        updated.bodyMd.length > 120
          ? `${updated.bodyMd.slice(0, 117)}...`
          : updated.bodyMd,
      sourceRef: {
        type: "entity_note",
        id: updated.id,
        parentType: updated.parentType,
        parentId: updated.parentId,
        source: "manual",
      },
    },
  });

  revalidatePath("/");
  if (updated.parentType === "area" && updated.parentId) {
    revalidatePath(`/areas/${updated.parentId}`);
    revalidatePath("/projects");
  } else if (updated.parentType === "project" && updated.parentId) {
    revalidatePath(`/projects/${updated.parentId}`);
  }
}

export async function updateJournalEntry(formData: FormData) {
  const entryId = getTrimmedString(formData, "entryId");
  if (!entryId) return;

  const normalized = normalizeJournalUpdateInput({
    bodyMd: getTrimmedString(formData, "bodyMd"),
    entryDate: getTrimmedString(formData, "entryDate"),
    tagsText: getTrimmedString(formData, "tags"),
  });
  if (!normalized) return;

  const entry = await prisma.journalEntry.update({
    where: { id: entryId },
    data: normalized,
  });
  await syncReferenceMentions("journal_entry", entry.id, entry.bodyMd);

  await prisma.notification.create({
    data: {
      type: "journal_entry_updated",
      title: "Journal entry updated",
      body:
        entry.bodyMd.length > 120
          ? `${entry.bodyMd.slice(0, 117)}...`
          : entry.bodyMd,
      sourceRef: { type: "journal_entry", id: entry.id, source: "manual" },
    },
  });

  revalidatePath("/");
  revalidatePath("/ideas");
}

export async function updatePersonProfile(formData: FormData) {
  const personId = getTrimmedString(formData, "personId");
  const name = getTrimmedString(formData, "name");
  if (!personId || !name) return;

  const areaId = getTrimmedString(formData, "areaId");
  const validArea = areaId
    ? await prisma.area.findFirst({
        where: { id: areaId, status: { not: "retired" } },
        select: { id: true },
      })
    : null;

  const person = await prisma.person.update({
    where: { id: personId },
    data: {
      name,
      relationshipType: getTrimmedString(formData, "relationshipType") || null,
      company: getTrimmedString(formData, "company") || null,
      email: getTrimmedString(formData, "email") || null,
      phone: getTrimmedString(formData, "phone") || null,
      notesMd: getTrimmedString(formData, "notesMd") || null,
      areaId: validArea?.id ?? null,
    },
  });

  await prisma.notification.create({
    data: {
      type: "person_updated",
      title: "Person updated",
      body: person.name,
      sourceRef: { type: "person", id: person.id, source: "manual" },
    },
  });

  revalidatePath("/ideas");
  revalidatePath(`/people/${person.id}`);
  redirect(`/people/${person.id}`);
}

export async function updatePersonFact(formData: FormData) {
  const personId = getTrimmedString(formData, "personId");
  const factId = getTrimmedString(formData, "factId");
  const factValue = getTrimmedString(formData, "factValue");
  if (!personId || !factId || !factValue) return;

  const dateRelevant = getTrimmedString(formData, "dateRelevant");
  const fact = await prisma.personFact.update({
    where: { id: factId },
    data: {
      factType: getTrimmedString(formData, "factType") || "note",
      factValue,
      dateRelevant: dateRelevant ? dateOnlyFromString(dateRelevant) : null,
      recurring: formData.get("recurring") === "on",
    },
  });

  await prisma.notification.create({
    data: {
      type: "person_fact_updated",
      title: "Person fact updated",
      body:
        fact.factValue.length > 120
          ? `${fact.factValue.slice(0, 117)}...`
          : fact.factValue,
      sourceRef: {
        type: "person_fact",
        id: fact.id,
        personId: fact.personId,
        source: "manual",
      },
    },
  });

  revalidatePath(`/people/${fact.personId}`);
  revalidatePath(`/people/${fact.personId}/facts/${fact.id}`);
  redirect(`/people/${fact.personId}/facts/${fact.id}`);
}

export async function updatePersonInteraction(formData: FormData) {
  const personId = getTrimmedString(formData, "personId");
  const interactionId = getTrimmedString(formData, "interactionId");
  if (!personId || !interactionId) return;

  const occurredOn = getTrimmedString(formData, "occurredOn");
  const interaction = await prisma.personInteraction.update({
    where: { id: interactionId },
    data: {
      interactionType:
        getTrimmedString(formData, "interactionType") || "touchpoint",
      notesMd: getTrimmedString(formData, "notesMd") || null,
      occurredAt: occurredOn
        ? new Date(`${occurredOn}T12:00:00.000Z`)
        : undefined,
    },
  });

  await syncReferenceMentions(
    "person_interaction",
    interaction.id,
    interaction.notesMd ?? interaction.interactionType,
  );

  await prisma.notification.create({
    data: {
      type: "person_interaction_updated",
      title: "Person interaction updated",
      body: interaction.notesMd?.slice(0, 120) ?? interaction.interactionType,
      sourceRef: {
        type: "person_interaction",
        id: interaction.id,
        personId: interaction.personId,
        source: "manual",
      },
    },
  });

  revalidatePath(`/people/${interaction.personId}`);
  revalidatePath(
    `/people/${interaction.personId}/interactions/${interaction.id}`,
  );
  redirect(`/people/${interaction.personId}/interactions/${interaction.id}`);
}

export async function createReferenceFromLookup(formData: FormData) {
  const kind = getTrimmedString(formData, "kind");
  const source = getTrimmedString(formData, "source");
  const sourceId = getTrimmedString(formData, "sourceId");
  const title = getTrimmedString(formData, "title");
  const body = getTrimmedString(formData, "body");
  if (
    (kind !== "book" && kind !== "movie" && kind !== "reference") ||
    !source ||
    !sourceId ||
    !title
  ) {
    return;
  }

  const sourcePath = `${source}:${sourceId}`;
  const tags = parseStringArray(getTrimmedString(formData, "tagsJson"));
  const metadata = parseJsonObject(getTrimmedString(formData, "metadataJson"));

  const reference = await prisma.reference.upsert({
    where: { sourcePath },
    update: {
      title,
      body: body || title,
      url: getTrimmedString(formData, "url") || null,
      tags,
      metadata,
      source,
    },
    create: {
      kind,
      title,
      body: body || title,
      url: getTrimmedString(formData, "url") || null,
      tags,
      metadata,
      source,
      sourcePath,
    },
  });

  await syncReferenceMentions("reference", reference.id, reference.body);

  await prisma.notification.create({
    data: {
      type: "reference_saved",
      title: `${kind === "book" ? "Book" : kind === "movie" ? "Movie" : "Reference"} saved`,
      body: reference.title ?? reference.body,
      sourceRef: {
        type: "reference",
        id: reference.id,
        kind,
        source,
        sourceId,
      },
    },
  });

  revalidatePath("/ideas");
  revalidatePath(
    `/ideas/${kind === "book" ? "books" : kind === "movie" ? "movies" : "references"}`,
  );
  redirect(`/references/${reference.id}`);
}

export type ReadLaterFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function saveReadLaterAction(
  _previousState: ReadLaterFormState,
  formData: FormData,
): Promise<ReadLaterFormState> {
  const url = getTrimmedString(formData, "url");
  const areaId = getTrimmedString(formData, "areaId") || null;
  const projectId = getTrimmedString(formData, "projectId") || null;
  const filingMode = getTrimmedString(formData, "filingMode") || "unchanged";

  try {
    const filing: ReadLaterFilingIntent =
      filingMode === "unfiled"
        ? { mode: "unfiled" }
        : filingMode === "area"
          ? { mode: "area", areaId: areaId ?? "" }
          : filingMode === "project"
            ? { mode: "project", projectId: projectId ?? "" }
            : { mode: "unchanged" };
    const normalizedUrl = normalizeReadLaterUrl(url);
    const existing = await prisma.reference.findFirst({
      where: {
        kind: "read_later",
        normalizedUrl,
        readStatus: { in: ["unread", "read"] },
      },
      select: { id: true },
    });
    const reference = await createReadLater(
      {
        url,
        source: "manual",
        filing,
      },
      undefined,
      { scheduleEnrichment: (job) => after(job) },
    );

    revalidateReadLaterPaths(reference.id, reference.areaId, reference.projectId);
    return {
      status: "success",
      message: existing
        ? filing.mode !== "unchanged"
          ? "Already saved. Filing updated."
          : "Already saved."
        : "Saved to Read Later.",
    };
  } catch (error) {
    return {
      status: "error",
      message: readLaterActionMessage(error),
    };
  }
}

export async function setReadLaterStatusAction(input: {
  referenceId: string;
  status: ReadLaterStatus;
}): Promise<ReadLaterMutationResult> {
  return performReadLaterStatusMutation(input, {
    setStatus: setReadLaterStatus,
    revalidate: (reference) => {
      revalidateReadLaterPaths(reference.id, reference.areaId, reference.projectId);
    },
  });
}

export async function fileReadLaterAction(input: {
  referenceId: string;
  filing: Exclude<ReadLaterFilingIntent, { mode: "unchanged" }>;
}): Promise<ReadLaterMutationResult> {
  return performReadLaterFilingMutation(input, {
    findReference: (id) => prisma.reference.findFirst({
      where: { id, kind: "read_later" },
      select: { id: true, areaId: true, projectId: true },
    }),
    resolveDestination: (destination) => resolveVerifiedDestination(destination),
    updateReference: (id, destination) => prisma.reference.update({
      where: { id },
      data: destination,
      select: { id: true, areaId: true, projectId: true },
    }),
    revalidate: (reference) => {
      revalidateReadLaterPaths(reference.id, reference.areaId, reference.projectId);
    },
  });
}

function revalidateReadLaterPaths(
  referenceId: string,
  areaId: string | null,
  projectId: string | null,
) {
  revalidatePath("/ideas");
  revalidatePath("/ideas/read-later");
  revalidatePath(`/references/${referenceId}`);
  if (areaId) revalidatePath(`/areas/${areaId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

function readLaterActionMessage(error: unknown) {
  if (!(error instanceof Error)) return "Could not save this link. Try again.";
  if (/valid HTTP\(S\) URL/.test(error.message)) return error.message;
  if (/Area not found|Project not found|selected Area/.test(error.message)) {
    return "That filing destination is no longer available.";
  }
  return "Could not save this link. Try again.";
}

export async function syncBookLoreSnippetsAction(formData: FormData) {
  const referenceId = getTrimmedString(formData, "referenceId");
  if (!referenceId) return;

  const result = await syncBookLoreSnippetsForReference(referenceId);
  if (result.ok) {
    await prisma.notification.create({
      data: {
        type: "booklore_snippets_synced",
        title: "BookLore highlights synced",
        body: `${result.synced} snippets synced`,
        sourceRef: {
          type: "reference",
          id: referenceId,
          provider: "booklore",
          source: "manual",
        },
      },
    });
  }

  revalidatePath("/ideas");
  revalidatePath("/ideas/books");
  revalidatePath(`/references/${referenceId}`);
}

export async function setReferenceSnippetStarred(formData: FormData) {
  const snippetId = getTrimmedString(formData, "snippetId");
  const nextValue = getTrimmedString(formData, "starred") === "true";
  if (!snippetId) return;

  const snippet = await prisma.referenceSnippet.findUnique({
    where: { id: snippetId },
    select: {
      id: true,
      referenceId: true,
      quote: true,
      starred: true,
    },
  });
  if (!snippet || snippet.starred === nextValue) return;

  const updated = await prisma.referenceSnippet.update({
    where: { id: snippet.id },
    data: { starred: nextValue },
  });

  await prisma.notification.create({
    data: {
      type: nextValue
        ? "reference_snippet_starred"
        : "reference_snippet_unstarred",
      title: nextValue ? "Reference snippet starred" : "Reference snippet unstarred",
      body:
        updated.quote.length > 120
          ? `${updated.quote.slice(0, 117)}...`
          : updated.quote,
      sourceRef: {
        type: "reference_snippet",
        id: updated.id,
        referenceId: updated.referenceId,
        source: "manual",
      },
    },
  });

  revalidatePath("/ideas");
  revalidatePath(`/references/${updated.referenceId}`);
}

export async function setReferenceRating(formData: FormData) {
  const referenceId = getTrimmedString(formData, "referenceId");
  const nextValue = Number(getTrimmedString(formData, "value"));
  if (!referenceId || !Number.isInteger(nextValue) || nextValue < 1) {
    return;
  }

  const reference = await prisma.reference.findUnique({
    where: { id: referenceId },
    select: { id: true, title: true, body: true, kind: true, metadata: true },
  });
  if (!reference) return;
  const maxRating = reference.kind === "book" ? 10 : 5;
  if (nextValue > maxRating) return;

  const metadata =
    typeof reference.metadata === "object" &&
    reference.metadata !== null &&
    !Array.isArray(reference.metadata)
      ? { ...(reference.metadata as Record<string, unknown>) }
      : {};
  const currentValue = Number(metadata.myRating);
  if (currentValue === nextValue) {
    delete metadata.myRating;
  } else {
    metadata.myRating = nextValue;
  }

  await prisma.reference.update({
    where: { id: reference.id },
    data: {
      metadata:
        Object.keys(metadata).length > 0
          ? (metadata as Prisma.InputJsonObject)
          : Prisma.JsonNull,
    },
  });

  await prisma.notification.create({
    data: {
      type: metadata.myRating
        ? "reference_rating_set"
        : "reference_rating_cleared",
      title: metadata.myRating ? "Reference rating set" : "Reference rating cleared",
      body: reference.title ?? reference.body,
      sourceRef: {
        type: "reference",
        id: reference.id,
        kind: reference.kind,
        rating: metadata.myRating ?? null,
        source: "manual",
      },
    },
  });

  revalidatePath("/ideas");
  revalidatePath(
    `/ideas/${reference.kind === "book" ? "books" : reference.kind === "movie" ? "movies" : "references"}`,
  );
  revalidatePath(`/references/${reference.id}`);
}

function getTrimmedString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseStringArray(value: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseTagsInput(value: string) {
  if (!value) return [];
  const seen = new Set<string>();
  return value
    .split(",")
    .map((item) => item.trim().replace(/^#/, ""))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function parseJsonObject(value: string): Prisma.InputJsonObject {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Prisma.InputJsonObject)
      : {};
  } catch {
    return {};
  }
}

function parseReminderOffsetsInput(value: string) {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .map((item) => Math.trunc(item));
}

function normalizeCreatedItems(
  value: Prisma.JsonValue | null,
): CreatedItemRef[] {
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
  if (!name) return;

  const area = areaId
    ? await prisma.area.findFirst({
        where: { id: areaId, status: "active", isSystem: false },
        select: { id: true },
      })
    : null;
  if (areaId && !area) return;

  const project = await prisma.project.create({
    data: {
      name,
      areaId: area?.id ?? null,
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

export async function createArea(formData: FormData) {
  const name = getTrimmedString(formData, "name");
  const parentAreaId = getTrimmedString(formData, "parentAreaId") || null;
  if (!name) return;

  const area = await prisma.$transaction(async (transaction) => {
    if (parentAreaId) {
      const parent = await transaction.area.findFirst({
        where: { id: parentAreaId, status: "active", isSystem: false },
        select: { id: true },
      });
      if (!parent) throw new Error("Parent Area not found.");
    }
    return createCompatibleArea(transaction, { name, parentAreaId });
  });

  revalidatePath("/projects");
  redirect(`/areas/${area.id}`);
}

export async function updateAreaParent(formData: FormData) {
  const areaId = getTrimmedString(formData, "areaId");
  const parentAreaId = getTrimmedString(formData, "parentAreaId") || null;
  if (!areaId) return;

  const previous = await prisma.area.findUnique({
    where: { id: areaId },
    select: { parentAreaId: true },
  });
  if (!previous) return;

  await prisma.$transaction(async (transaction) => {
    if (parentAreaId) {
      const parent = await transaction.area.findFirst({
        where: { id: parentAreaId, status: "active", isSystem: false },
        select: { id: true },
      });
      if (!parent) throw new Error("Parent Area not found.");
    }
    await updateAreaWithValidatedParent(
      areaId,
      parentAreaId,
      () => transaction.area.update({ where: { id: areaId }, data: { parentAreaId } }),
      transaction,
    );
  });

  revalidatePath("/projects");
  revalidatePath("/areas/inbox");
  revalidatePath("/areas/[areaId]", "page");
  revalidatePath("/projects/[projectId]", "page");
  revalidatePath(`/areas/${areaId}`);
  if (previous.parentAreaId) revalidatePath(`/areas/${previous.parentAreaId}`);
  if (parentAreaId) revalidatePath(`/areas/${parentAreaId}`);
}

export async function updateProjectArea(formData: FormData) {
  const projectId = getTrimmedString(formData, "projectId");
  const areaId = getTrimmedString(formData, "areaId") || null;
  if (!projectId) return;

  const previous = await prisma.project.findUnique({
    where: { id: projectId },
    select: { areaId: true },
  });
  if (!previous) return;

  await fileProject(projectId, areaId);
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/areas/inbox");
  revalidatePath(`/projects/${projectId}`);
  if (previous.areaId) revalidatePath(`/areas/${previous.areaId}`);
  if (areaId) revalidatePath(`/areas/${areaId}`);
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
      targetDate:
        openEnded || !targetDate ? null : dateOnlyFromString(targetDate),
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
  if (!bodyMd) return;
  const parent = await resolveFormParent(parentType, parentId);
  if (!parent) return;

  const note = await prisma.entityNote.create({
    data: {
      parentType: parent.parentType,
      parentId: parent.parentId,
      bodyMd,
      source: "manual",
    },
  });
  await syncReferenceMentions("entity_note", note.id, bodyMd);

  if (parent.parentType && parent.parentId) {
    revalidateEntityParent(parent.parentType, parent.parentId);
  }
}

export async function updateEntityNote(formData: FormData) {
  const noteId = getTrimmedString(formData, "noteId");
  const bodyMd = getTrimmedString(formData, "bodyMd");
  if (!noteId || !bodyMd) return;

  const note = await prisma.entityNote.update({
    where: { id: noteId },
    data: { bodyMd },
  });
  await syncReferenceMentions("entity_note", note.id, bodyMd);

  await prisma.notification.create({
    data: {
      type: "note_updated",
      title: "Note updated",
      body: bodyMd.length > 120 ? `${bodyMd.slice(0, 117)}...` : bodyMd,
      sourceRef: {
        type: "entity_note",
        id: note.id,
        parentType: note.parentType,
        parentId: note.parentId,
        source: "manual",
      },
    },
  });

  if (note.parentType && note.parentId) {
    revalidateEntityParent(note.parentType, note.parentId);
  }
}

async function getEffectiveCaptureText(
  captureId: string,
  rawText: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const latestEdit = await client.captureTextEdit.findFirst({
    where: { captureId },
    orderBy: { createdAt: "desc" },
    select: { text: true },
  });
  return latestEdit?.text ?? rawText;
}

async function lockCaptureReviewProposal(
  client: Prisma.TransactionClient,
  proposalId: string,
) {
  const lockKey = `capture-review-proposal:${proposalId}`;
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

export async function updateCaptureText(formData: FormData) {
  const captureId = getTrimmedString(formData, "captureId");
  const text = getTrimmedString(formData, "text");
  if (!captureId || !text) return;

  const capture = await prisma.capture.findUnique({
    where: { id: captureId },
    select: { id: true, rawText: true },
  });
  if (!capture || capture.rawText === text) return;

  await prisma.captureTextEdit.create({
    data: {
      captureId: capture.id,
      text,
      source: "manual",
    },
  });

  await prisma.notification.create({
    data: {
      type: "capture_text_edited",
      title: "Capture text edited",
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      sourceRef: { type: "capture", id: capture.id, source: "manual" },
    },
  });

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/search");
  revalidatePath(`/captures/${capture.id}`);
}

export async function dismissCapture(formData: FormData) {
  const captureId = getTrimmedString(formData, "captureId");
  if (!captureId) return;

  const capture = await prisma.capture.findUnique({
    where: { id: captureId },
    select: { id: true, rawText: true, status: true },
  });
  if (!capture || capture.status === "dismissed") return;

  await prisma.capture.update({
    where: { id: capture.id },
    data: { status: "dismissed" },
  });

  await prisma.notification.create({
    data: {
      type: "capture_dismissed",
      title: "Capture archived",
      body:
        capture.rawText.length > 120
          ? `${capture.rawText.slice(0, 117)}...`
          : capture.rawText,
      sourceRef: { type: "capture", id: capture.id, source: "manual" },
    },
  });

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/projects");
  revalidatePath("/search");
  revalidatePath(`/captures/${capture.id}`);
}

export async function convertPendingCapture(formData: FormData) {
  const captureId = getTrimmedString(formData, "captureId");
  const areaId = getTrimmedString(formData, "areaId") || null;
  const projectId = getTrimmedString(formData, "projectId") || null;
  const targetType = getTrimmedString(formData, "targetType");
  const reviewId = getTrimmedString(formData, "reviewId");
  const proposalId = getTrimmedString(formData, "proposalId");
  if (
    !captureId ||
    (targetType !== "task" &&
      targetType !== "idea" &&
      targetType !== "note" &&
      targetType !== "reference")
  ) {
    return;
  }

  const converted = await prisma.$transaction(async (client) => {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${captureId}, 0))`;
    if (proposalId) {
      await lockCaptureReviewProposal(client, proposalId);
    }
    const capture = await client.capture.findUnique({ where: { id: captureId } });
    if (!capture) return null;
    let destination: Awaited<ReturnType<typeof resolveVerifiedDestination>>;
    try {
      destination = await resolveVerifiedDestination(
        { areaId, projectId },
        client,
      );
    } catch {
      return null;
    }
    const [area, project] = await Promise.all([
      destination.areaId
        ? client.area.findUnique({
            where: { id: destination.areaId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      destination.projectId
        ? client.project.findUnique({
            where: { id: destination.projectId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);
    const destinationLabel = project?.name ?? area?.name ?? "Inbox";
    const existingItems = normalizeCreatedItems(capture.createdItems);
    const alreadyConverted = existingItems.find(
      (existing) =>
        existing.type !== "pending_capture" && existing.type !== "notification",
    );
    if (alreadyConverted) {
      return {
        captureId: capture.id,
        areaId: destination.areaId,
        projectId: destination.projectId,
      };
    }
    const proposal = proposalId
      ? await client.captureReviewProposal.findFirst({
          where: {
            id: proposalId,
            captureId: capture.id,
            status: { in: ["pending", "snoozed"] },
          },
          select: {
            id: true,
            suggestedType: true,
            suggestedAreaId: true,
            suggestedProjectId: true,
            model: true,
            promptVersion: true,
          },
        })
      : null;
    if (proposalId && !proposal) return null;
    if (proposal) {
      const acceptedProposal = await client.captureReviewProposal.updateMany({
        where: {
          id: proposal.id,
          captureId: capture.id,
          status: { in: ["pending", "snoozed"] },
        },
        data: { status: "accepted", resolvedAt: new Date() },
      });
      if (acceptedProposal.count !== 1) return null;
    }
    const captureText = await getEffectiveCaptureText(
      capture.id,
      capture.rawText,
      client,
    );

  let item: CreatedItemRef;
  if (targetType === "task") {
    const task = await createTaskWithAudit(
      {
        title: captureText,
        areaId: destination.areaId,
        projectId: destination.projectId,
        captureId: capture.id,
        source: "manual",
      },
      { source: "manual" },
      client,
    );
    item = { type: "task", id: task.id, label: `Task added to ${destinationLabel}` };
  } else if (targetType === "idea") {
    const idea = await client.idea.create({
      data: {
        title: captureText,
        body: captureText,
        areaId: destination.areaId,
        projectId: destination.projectId,
        source: "manual",
        captureId: capture.id,
      },
    });
    item = { type: "idea", id: idea.id, label: `Idea saved to ${destinationLabel}` };
  } else if (targetType === "note") {
    const note = await client.entityNote.create({
      data: {
        parentType: destination.projectId
          ? "project"
          : destination.areaId
            ? "area"
            : null,
        parentId: destination.projectId ?? destination.areaId,
        bodyMd: captureText,
        source: "manual",
        captureId: capture.id,
      },
    });
    item = {
      type: "entity_note",
      id: note.id,
      label: `Note added to ${destinationLabel}`,
    };
    await syncReferenceMentions("entity_note", note.id, captureText, client);
  } else {
    const reference = await client.reference.create({
      data: {
        body: captureText,
        areaId: destination.areaId,
        projectId: destination.projectId,
        source: "manual",
        captureId: capture.id,
      },
    });
    item = {
      type: "reference",
      id: reference.id,
      label: `Reference saved to ${destinationLabel}`,
    };
    await syncReferenceMentions("reference", reference.id, captureText, client);
  }

  await client.capture.update({
    where: { id: capture.id },
    data: {
      parseStatus: "parsed",
      createdItems: [
        ...existingItems.filter(
          (existing) => existing.type !== "pending_capture",
        ),
        item,
      ] as Prisma.InputJsonValue,
    },
  });

  await client.notification.create({
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

  // Converting from a "Needs review" row settles the review too.
  if (reviewId) {
    const review = await client.scheduledReview.findFirst({
      where: { id: reviewId, captureId: capture.id },
      select: { id: true, status: true },
    });
    if (review && review.status !== "done" && review.status !== "dismissed") {
      await client.scheduledReview.update({
        where: { id: review.id },
        data: { status: "done" },
      });
      await client.notification.create({
        data: {
          type: "review_done",
          title: "Review converted",
          body: item.label,
          sourceRef: {
            type: "scheduled_review",
            id: review.id,
            source: "manual",
          },
        },
      });
    }
  }

  if (proposal) {
      await client.notification.create({
        data: {
          type: "capture_review_accepted",
          title: "Capture review accepted",
          body: item.label,
          sourceRef: {
            type: "capture_review_proposal",
            id: proposal.id,
            captureId: capture.id,
            source: "manual",
          },
        },
      });
      const accepted =
        proposal.suggestedType === targetType &&
        (proposal.suggestedAreaId ?? null) === destination.areaId &&
        (proposal.suggestedProjectId ?? null) === destination.projectId;
      await recordCaptureRoutingFeedback(
        {
          captureId: capture.id,
          proposalId: proposal.id,
          outcome: accepted ? "accepted" : "corrected",
          effectiveText: captureText,
          proposed: {
            targetType: proposal.suggestedType,
            areaId: proposal.suggestedAreaId,
            projectId: proposal.suggestedProjectId,
          },
          final: {
            targetType,
            areaId: destination.areaId,
            projectId: destination.projectId,
          },
          model: proposal.model,
          promptVersion: proposal.promptVersion,
        },
        client,
      );
  } else if (!proposalId) {
    await recordCaptureRoutingFeedback(
      {
        captureId: capture.id,
        outcome: "corrected",
        effectiveText: captureText,
        final: {
          targetType,
          areaId: destination.areaId,
          projectId: destination.projectId,
        },
      },
      client,
    );
  }
    return {
      captureId: capture.id,
      areaId: destination.areaId,
      projectId: destination.projectId,
    };
  });
  if (!converted) return;

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/search");
  revalidatePath(`/captures/${converted.captureId}`);
  if (converted.areaId) revalidatePath(`/areas/${converted.areaId}`);
  if (converted.projectId) revalidatePath(`/projects/${converted.projectId}`);
}

export async function snoozeCaptureReviewProposalOneDay(formData: FormData) {
  const proposalId = getTrimmedString(formData, "proposalId");
  if (!proposalId) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const proposal = await prisma.$transaction(async (client) => {
    await lockCaptureReviewProposal(client, proposalId);
    const snoozed = await client.captureReviewProposal.updateMany({
      where: {
        id: proposalId,
        status: { in: ["pending", "snoozed"] },
      },
      data: { status: "snoozed", snoozedUntil: tomorrow },
    });
    if (snoozed.count !== 1) return null;

    const updated = await client.captureReviewProposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: { capture: { select: { rawText: true } } },
    });
    await client.notification.create({
      data: {
        type: "capture_review_snoozed",
        title: "Capture review snoozed",
        body: updated.capture.rawText,
        sourceRef: {
          type: "capture_review_proposal",
          id: updated.id,
          captureId: updated.captureId,
          source: "manual",
        },
      },
    });
    return updated;
  });
  if (!proposal) return;

  revalidatePath("/");
  revalidatePath(`/captures/${proposal.captureId}`);
}

export async function dismissCaptureReviewProposal(formData: FormData) {
  const proposalId = getTrimmedString(formData, "proposalId");
  if (!proposalId) return;

  const proposal = await prisma.$transaction(async (client) => {
    await lockCaptureReviewProposal(client, proposalId);
    const pending = await client.captureReviewProposal.findFirst({
      where: {
        id: proposalId,
        status: { in: ["pending", "snoozed"] },
      },
      include: { capture: { select: { rawText: true } } },
    });
    if (!pending) return null;
    const effectiveText = await getEffectiveCaptureText(
      pending.captureId,
      pending.capture.rawText,
      client,
    );
    const claimed = await client.captureReviewProposal.updateMany({
      where: {
        id: pending.id,
        status: { in: ["pending", "snoozed"] },
      },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    const dismissed = await client.captureReviewProposal.findUniqueOrThrow({
      where: { id: pending.id },
      include: { capture: { select: { rawText: true } } },
    });
    await recordCaptureRoutingFeedback(
      {
        captureId: dismissed.captureId,
        proposalId: dismissed.id,
        outcome: "dismissed",
        effectiveText,
        proposed: {
          targetType: dismissed.suggestedType,
          areaId: dismissed.suggestedAreaId,
          projectId: dismissed.suggestedProjectId,
        },
        model: dismissed.model,
        promptVersion: dismissed.promptVersion,
      },
      client,
    );
    await client.notification.create({
      data: {
        type: "capture_review_dismissed",
        title: "Capture review dismissed",
        body: dismissed.capture.rawText,
        sourceRef: {
          type: "capture_review_proposal",
          id: dismissed.id,
          captureId: dismissed.captureId,
          source: "manual",
        },
      },
    });
    return dismissed;
  });
  if (!proposal) return;

  revalidatePath("/");
  revalidatePath(`/captures/${proposal.captureId}`);
}

export async function createEntityDoc(formData: FormData) {
  const parentType = getTrimmedString(formData, "parentType");
  const parentId = getTrimmedString(formData, "parentId");
  const title = getTrimmedString(formData, "title");
  const bodyMd = getTrimmedString(formData, "bodyMd");
  if (!title || !bodyMd) return;
  const parent = await resolveFormParent(parentType, parentId);
  if (!parent) return;

  await prisma.entityDoc.create({
    data: {
      parentType: parent.parentType,
      parentId: parent.parentId,
      title,
      bodyMd,
      source: "manual",
    },
  });

  if (parent.parentType && parent.parentId) {
    revalidateEntityParent(parent.parentType, parent.parentId);
  }
}

export async function importEntityDocMarkdown(formData: FormData) {
  const parentType = getTrimmedString(formData, "parentType");
  const parentId = getTrimmedString(formData, "parentId");
  const file = formData.get("markdownFile");
  if (!(file instanceof File) || file.size === 0) return;
  const parent = await resolveFormParent(parentType, parentId);
  if (!parent) return;

  const bodyMd = await file.text();
  const fallbackTitle = file.name.replace(/\.(md|markdown|txt)$/i, "").trim();
  const title =
    getTrimmedString(formData, "title") || fallbackTitle || "Imported doc";

  await prisma.entityDoc.create({
    data: {
      parentType: parent.parentType,
      parentId: parent.parentId,
      title,
      bodyMd,
      source: "manual",
    },
  });

  if (parent.parentType && parent.parentId) {
    revalidateEntityParent(parent.parentType, parent.parentId);
  }
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

  if (doc.parentType && doc.parentId) {
    revalidateEntityParent(doc.parentType, doc.parentId);
  }
}

export async function archiveEntityDoc(formData: FormData) {
  const docId = getTrimmedString(formData, "docId");
  if (!docId) return;

  const doc = await prisma.entityDoc.update({
    where: { id: docId },
    data: { status: "archived" },
  });

  if (doc.parentType && doc.parentId) {
    revalidateEntityParent(doc.parentType, doc.parentId);
  }
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

export async function toggleMilestone(formData: FormData) {
  const milestoneId = getTrimmedString(formData, "milestoneId");
  if (!milestoneId) return;

  const existing = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { id: true, projectId: true, title: true, status: true },
  });
  if (!existing) return;

  const nextStatus = existing.status === "completed" ? "open" : "completed";
  const milestone = await prisma.milestone.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      completedAt: nextStatus === "completed" ? new Date() : null,
    },
  });

  await prisma.projectActivity.create({
    data: {
      projectId: milestone.projectId,
      entry:
        nextStatus === "completed"
          ? `Milestone completed: ${milestone.title}.`
          : `Milestone reopened: ${milestone.title}.`,
      source: "manual",
    },
  });

  revalidatePath("/projects");
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

function revalidateEntityParent(parentType: EntityParentType, parentId: string) {
  if (parentType === "area") {
    revalidatePath(`/areas/${parentId}`);
  }
  if (parentType === "project") {
    revalidatePath(`/projects/${parentId}`);
  }
}

async function resolveFormParent(parentType: string, parentId: string) {
  if (!parentType && !parentId) {
    return { parentType: null, parentId: null };
  }
  if (parentType === "area" && parentId) {
    const destination = await resolveVerifiedDestination({ areaId: parentId });
    return { parentType: "area" as const, parentId: destination.areaId };
  }
  if (parentType === "project" && parentId) {
    const project = await prisma.project.findUnique({
      where: { id: parentId },
      select: { areaId: true },
    });
    if (!project) return null;
    await resolveVerifiedDestination({ areaId: project.areaId, projectId: parentId });
    return { parentType: "project" as const, parentId };
  }
  return null;
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
      title:
        status === "active"
          ? "Area active"
          : status === "parked"
            ? "Area parked"
            : "Area retired",
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
