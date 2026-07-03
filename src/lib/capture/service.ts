import { Prisma, type CaptureParseStatus } from "@prisma/client";
import { addHours, parseISO } from "date-fns";
import { localDateString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { parseCaptureWithContext } from "@/lib/capture/parser";
import { createCheckInRecord } from "@/lib/checkins";
import { boostResurfaceByMatch } from "@/lib/resurfacing";
import { createPersonRecord, findPersonByMatch } from "@/lib/people";
import { completeRoutineByMatch } from "@/lib/routines";
import { completeTaskByMatch, setTaskStarredByMatch } from "@/lib/tasks";
import {
  captureInputSchema,
  type CaptureConfirmation,
  type CaptureInput,
  type CreatedItemRef,
  type ExecutableAction,
  type ParserAction,
} from "@/lib/capture/types";

type DomainContext = {
  id: string;
  name: string;
  areas: AreaContext[];
};

type AreaContext = {
  id: string;
  name: string;
  domain: string;
  status: string;
};

type ExecutionContext = {
  captureId: string;
  rawText: string;
  captureSource: CaptureInput["source"];
  inboxAreaId: string;
  domains: DomainContext[];
  areas: AreaContext[];
  actor: { source: "capture" | "api"; label?: string };
  writeSource: string;
  calendarSource: "capture" | "api";
};

export async function submitCapture(
  input: CaptureInput,
): Promise<CaptureConfirmation> {
  const parsedInput = captureInputSchema.parse(input);

  const capture = await prisma.capture.create({
    data: {
      rawText: parsedInput.rawText,
      source: parsedInput.source,
      deviceContext: parsedInput.deviceContext as Prisma.InputJsonValue,
    },
  });

  let actions: ParserAction[] = [];
  let status: CaptureParseStatus = "parsed";
  let createdItems: CreatedItemRef[] = [];

  try {
    const parserContext = await buildParserContext(parsedInput.source);
    actions = await parseCaptureWithContext(parsedInput.rawText, parserContext);

    const ambiguous = actions.some((action) => "needs_disambiguation" in action);
    const failed = actions.some((action) => "error" in action);
    status = ambiguous ? "ambiguous" : failed ? "failed" : "parsed";

    const executableActions = actions.filter(isExecutableAction);
    const context: ExecutionContext = {
      captureId: capture.id,
      rawText: parsedInput.rawText,
      captureSource: parsedInput.source,
      inboxAreaId: await getInboxAreaId(),
      domains: parserContext.domains,
      areas: parserContext.areas,
      ...buildActorContext(parsedInput),
    };

    if (status === "parsed" && executableActions.length > 0) {
      createdItems = await executeActions(executableActions, context);
    } else {
      createdItems = await markCapturePending(context);
    }
  } catch (error) {
    status = "failed";
    actions = [
      {
        error: error instanceof Error ? error.message : "Capture parsing failed.",
      },
    ];

    createdItems = await markCapturePending({
      captureId: capture.id,
      rawText: parsedInput.rawText,
      captureSource: parsedInput.source,
      inboxAreaId: await getInboxAreaId(),
      domains: [],
      areas: [],
      ...buildActorContext(parsedInput),
    });
  }

  await prisma.capture.update({
    where: { id: capture.id },
    data: {
      parseStatus: status,
      parsedActions: actions as Prisma.InputJsonValue,
      createdItems: createdItems as Prisma.InputJsonValue,
    },
  });

  return {
    captureId: capture.id,
    status,
    message: buildConfirmationMessage(status, createdItems),
    createdItems,
  };
}

async function buildParserContext(source: string) {
  const [domains, projects, recentIdeas] = await Promise.all([
    prisma.domain.findMany({
      where: { active: true, isSystem: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        areas: {
          where: { status: { in: ["active", "parked"] } },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, status: true },
        },
      },
    }),
    prisma.project.findMany({
      where: { status: { in: ["active", "someday", "parked"] } },
      include: { area: { include: { domain: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.idea.findMany({
      where: {
        createdAt: {
          gte: addHours(new Date(), -24 * 60),
        },
      },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const domainContext = domains.map((domain) => ({
    id: domain.id,
    name: domain.name,
    areas: domain.areas.map((area) => ({
      id: area.id,
      name: area.name,
      domain: domain.name,
      status: area.status,
    })),
  }));
  const areas = domainContext.flatMap((domain) => domain.areas);

  return {
    now: new Date().toISOString(),
    timezone: "America/New_York" as const,
    source,
    domains: domainContext,
    areas,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      area: project.area.name,
      current_state: project.currentState,
    })),
    recentIdeas,
  };
}

function isExecutableAction(action: ParserAction): action is ExecutableAction {
  return "type" in action;
}

function buildActorContext(input: CaptureInput) {
  if (input.source !== "api") {
    return {
      actor: { source: "capture" as const },
      writeSource: "capture",
      calendarSource: "capture" as const,
    };
  }

  const label =
    isRecord(input.deviceContext) && typeof input.deviceContext.apiKeyLabel === "string"
      ? input.deviceContext.apiKeyLabel
      : undefined;

  return {
    actor: { source: "api" as const, label },
    writeSource: label ? `api:${label}` : "api",
    calendarSource: "api" as const,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getInboxAreaId() {
  const systemDomain = await prisma.domain.upsert({
    where: { name: "System" },
    update: { active: false, isSystem: true },
    create: {
      name: "System",
      description: "Hidden system grouping for the Inbox area.",
      sortOrder: 0,
      isSystem: true,
      active: false,
    },
  });

  const inbox = await prisma.area.upsert({
    where: { id: "area_inbox" },
    update: {
      name: "Inbox",
      domainId: systemDomain.id,
      isSystem: true,
      status: "active",
    },
    create: {
      id: "area_inbox",
      name: "Inbox",
      domainId: systemDomain.id,
      isSystem: true,
      status: "active",
      currentState: "System catch-all for quick-add and genuinely ambiguous captures.",
      nextStep: "Route items when the right area becomes clear.",
    },
  });

  return inbox.id;
}

async function executeActions(
  actions: ExecutableAction[],
  context: ExecutionContext,
) {
  const createdItems: CreatedItemRef[] = [];

  for (const action of actions) {
    switch (action.type) {
      case "create_task":
        createdItems.push(await createTask(action, context));
        break;
      case "complete_task": {
        const completed = await completeTask(action.task_match, context);
        createdItems.push(completed);
        break;
      }
      case "star_task": {
        const starred = action.starred ?? true;
        const task = await setTaskStarredByMatch(
          action.task_match,
          starred,
          context.actor,
        );
        createdItems.push({
          type: "task",
          id: task.id,
          label: starred
            ? `Starred "${task.title}"`
            : `Unstarred "${task.title}"`,
        });
        break;
      }
      case "create_area":
        createdItems.push(await createArea(action, context));
        break;
      case "update_area_state":
        createdItems.push(...(await updateAreaState(action, context)));
        break;
      case "create_project":
        createdItems.push(await createProject(action, context));
        break;
      case "update_project_state":
        createdItems.push(...(await updateProjectState(action, context)));
        break;
      case "create_calendar_event":
        createdItems.push(await createCalendarEvent(action, context));
        break;
      case "create_idea":
        createdItems.push(await createIdea(action, context));
        break;
      case "append_to_idea":
        createdItems.push(await appendToIdea(action, context));
        break;
      case "convert_idea":
        createdItems.push(await convertIdea(action, context));
        break;
      case "create_reference":
        createdItems.push(await createReference(action, context));
        break;
      case "check_in":
        createdItems.push(await executeCheckIn(action, context));
        break;
      case "journal":
        createdItems.push(await executeJournal(action, context));
        break;
      case "schedule_review":
        createdItems.push(await executeScheduleReview(action, context));
        break;
      case "create_routine":
        createdItems.push(await executeCreateRoutine(action, context));
        break;
      case "create_person":
        createdItems.push(await executeCreatePerson(action, context));
        break;
      case "create_person_fact":
        createdItems.push(...(await executeCreatePersonFact(action, context)));
        break;
      case "log_interaction":
        createdItems.push(...(await executeLogInteraction(action, context)));
        break;
      case "complete_routine": {
        const result = await completeRoutineByMatch(
          action.routine_match,
          context.actor,
          action.value,
        );
        createdItems.push({
          type: "routine_completion",
          id: result.completion?.id ?? result.routine.id,
          label: result.repeated
            ? `${result.routine.name} was already done today`
            : `Completed routine: ${result.routine.name}`,
        });
        break;
      }
      case "boost_resurface": {
        const boosted = await boostResurfaceByMatch(action.item_match);
        if (!boosted) {
          throw new Error(
            `No idea or journal entry matched "${action.item_match}" to boost.`,
          );
        }
        createdItems.push({
          type: boosted.itemType === "idea" ? "idea" : "journal_entry",
          id: boosted.id,
          label: `Boosted: ${boosted.label}`,
        });
        break;
      }
      case "create_entity_note":
        createdItems.push(await createEntityNote(action, context));
        break;
      case "create_entity_doc":
        createdItems.push(await createEntityDoc(action, context));
        break;
    }
  }

  if (createdItems.length > 0) {
    const notification = await prisma.notification.create({
      data: {
        type: "capture_processed",
        title: "Capture processed",
        body: buildConfirmationMessage("parsed", createdItems),
        sourceRef: {
          type: "capture",
          id: context.captureId,
          source: context.actor.source,
          actor: context.actor.label ?? null,
        },
      },
    });

    createdItems.push({
      type: "notification",
      id: notification.id,
      label: notification.title,
    });
  }

  return createdItems;
}

async function markCapturePending(context: ExecutionContext) {
  const notification = await prisma.notification.create({
    data: {
      type: "capture_needs_review",
      title: "Capture saved to Inbox",
      body: context.rawText,
      sourceRef: {
        type: "capture",
        id: context.captureId,
        source: context.actor.source,
        actor: context.actor.label ?? null,
      },
    },
  });

  return [
    {
      type: "pending_capture" as const,
      id: context.captureId,
      label: "Saved to Inbox to sort later",
    },
    {
      type: "notification" as const,
      id: notification.id,
      label: notification.title,
    },
  ];
}

async function createTask(
  action: Extract<ExecutableAction, { type: "create_task" }>,
  context: ExecutionContext,
) {
  const project = action.project_match
    ? await matchProject(action.project_match)
    : undefined;
  const areaId =
    project?.areaId ??
    matchAreaId(action.area_match, context.areas) ??
    context.inboxAreaId;

  const task = await prisma.task.create({
    data: {
      title: action.title,
      notes: action.notes,
      dueDate: parseDateOnly(action.due_date),
      dueTime: action.due_time,
      priority: action.priority,
      reminderOffsets: action.reminder_offsets as Prisma.InputJsonValue,
      areaId,
      projectId: project?.id,
      someday: action.someday ?? false,
      starred: action.starred ?? false,
      source: context.writeSource,
      captureId: context.captureId,
    },
    include: { area: true, project: true },
  });

  return {
    type: "task" as const,
    id: task.id,
    label: `Task added to ${task.project?.name ?? task.area.name}`,
  };
}

async function createArea(
  action: Extract<ExecutableAction, { type: "create_area" }>,
  context: ExecutionContext,
) {
  const domain = matchDomain(action.domain_match, context.domains);
  if (!domain) {
    throw new Error(`No domain matched "${action.domain_match}".`);
  }

  const area = await prisma.area.create({
    data: {
      name: action.name,
      domainId: domain.id,
      currentState: "Created from capture. Current state needs detail.",
      nextStep: "Define the next physical step.",
    },
    include: { domain: true },
  });

  const note = await prisma.entityNote.create({
    data: {
      parentType: "area",
      parentId: area.id,
      bodyMd: `Area created from capture: ${context.rawText}`,
      source: context.writeSource,
      captureId: context.captureId,
    },
  });

  return {
    type: "area" as const,
    id: area.id,
    label: `Area in ${area.domain.name}: ${area.name}`,
    noteId: note.id,
  };
}

async function updateAreaState(
  action: Extract<ExecutableAction, { type: "update_area_state" }>,
  context: ExecutionContext,
) {
  const areaId = matchAreaId(action.area_match, context.areas);
  if (!areaId) {
    throw new Error(`No area matched "${action.area_match}".`);
  }

  const area = await prisma.area.update({
    where: { id: areaId },
    data: {
      currentState: action.current_state,
      nextStep: action.next_step,
      status: action.status,
    },
  });

  const note = await prisma.entityNote.create({
    data: {
      parentType: "area",
      parentId: area.id,
      bodyMd: action.log_entry ?? context.rawText,
      source: context.writeSource,
      captureId: context.captureId,
    },
  });

  const items: CreatedItemRef[] = [
    {
      type: "area" as const,
      id: area.id,
      label: `Updated area: ${area.name}`,
    },
    {
      type: "entity_note" as const,
      id: note.id,
      label: "Area note logged",
    },
  ];

  if (action.current_state?.trim()) {
    const nextStep = action.next_step?.trim();
    const { checkIn } = await createCheckInRecord(
      {
        parentType: "area",
        parentId: area.id,
        bodyMd:
          action.current_state.trim() +
          (nextStep ? `\n\nNext step: ${nextStep}` : ""),
        source: context.captureSource === "in_app_voice" ? "voice" : "manual",
        captureId: context.captureId,
      },
      context.actor,
    );
    items.push({
      type: "check_in",
      id: checkIn.id,
      label: `Check-in posted to ${area.name}`,
    });
  }

  return items;
}

async function completeTask(taskMatch: string, context: ExecutionContext) {
  const { completed, nextInstance } = await completeTaskByMatch(
    taskMatch,
    context.actor,
  );

  return {
    type: "task" as const,
    id: completed.id,
    label: nextInstance
      ? `Completed task and created next recurrence: ${completed.title}`
      : `Completed task: ${completed.title}`,
  };
}

async function createProject(
  action: Extract<ExecutableAction, { type: "create_project" }>,
  context: ExecutionContext,
) {
  const areaId = matchAreaId(action.area_match, context.areas) ?? context.inboxAreaId;

  const project = await prisma.project.create({
    data: {
      name: action.name,
      areaId,
      status: action.status ?? "active",
      targetDate: parseDateOnly(action.target_date),
      activity: {
        create: {
          entry: `Project created from capture: ${context.rawText}`,
          source: context.writeSource,
          captureId: context.captureId,
        },
      },
    },
    include: { area: true },
  });

  return {
    type: "project" as const,
    id: project.id,
    label: `Project saved to ${project.area.name}`,
  };
}

async function updateProjectState(
  action: Extract<ExecutableAction, { type: "update_project_state" }>,
  context: ExecutionContext,
) {
  const projectId = await matchProjectId(action.project_match);
  if (!projectId) {
    throw new Error(`No project matched "${action.project_match}".`);
  }

  const now = new Date();
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      currentState: action.current_state,
      nextStep: action.next_step,
      status: action.status,
      parkedAt:
        action.status === "parked"
          ? now
          : action.status === "active"
            ? null
            : undefined,
      completedAt: action.status === "completed" ? now : undefined,
      killedAt: action.status === "killed" ? now : undefined,
    },
  });

  const activity = await prisma.projectActivity.create({
    data: {
      projectId,
      entry: action.log_entry ?? context.rawText,
      source: context.writeSource,
      captureId: context.captureId,
      stateSnapshot: {
        status: project.status,
        current_state: project.currentState,
        next_step: project.nextStep,
      },
    },
  });

  const items: CreatedItemRef[] = [
    {
      type: "project" as const,
      id: project.id,
      label: `Updated project: ${project.name}`,
    },
    {
      type: "project_activity" as const,
      id: activity.id,
      label: "Project activity logged",
    },
  ];

  // Check-ins are the living record now; state narration written through
  // the legacy action must still surface on cards and feeds.
  if (action.current_state?.trim()) {
    const nextStep = action.next_step?.trim();
    const { checkIn } = await createCheckInRecord(
      {
        parentType: "project",
        parentId: project.id,
        bodyMd:
          action.current_state.trim() +
          (nextStep ? `\n\nNext step: ${nextStep}` : ""),
        source: context.captureSource === "in_app_voice" ? "voice" : "manual",
        captureId: context.captureId,
      },
      context.actor,
    );
    items.push({
      type: "check_in",
      id: checkIn.id,
      label: `Check-in posted to ${project.name}`,
    });
  }

  return items;
}

async function createCalendarEvent(
  action: Extract<ExecutableAction, { type: "create_calendar_event" }>,
  context: ExecutionContext,
) {
  const event = await prisma.calendarEvent.create({
    data: {
      title: action.title,
      start: parseDateTime(action.start),
      end: parseDateTime(action.end),
      location: action.location,
      source: context.calendarSource,
      captureId: context.captureId,
    },
  });

  return {
    type: "calendar_event" as const,
    id: event.id,
    label: `Calendar event: ${event.title}`,
  };
}

async function createIdea(
  action: Extract<ExecutableAction, { type: "create_idea" }>,
  context: ExecutionContext,
) {
  const project = action.project_match
    ? await matchProject(action.project_match)
    : undefined;
  const idea = await prisma.idea.create({
    data: {
      title: action.title,
      body: action.body,
      tags: action.tags ?? [],
      areaId:
        project?.areaId ??
        matchAreaId(action.area_match, context.areas) ??
        context.inboxAreaId,
      projectId: project?.id,
      source: context.writeSource,
      captureId: context.captureId,
    },
    include: { area: true, project: true },
  });

  return {
    type: "idea" as const,
    id: idea.id,
    label: `Idea saved to ${idea.project?.name ?? idea.area?.name ?? "Inbox"}`,
  };
}

async function appendToIdea(
  action: Extract<ExecutableAction, { type: "append_to_idea" }>,
  context: ExecutionContext,
) {
  const idea = await prisma.idea.findFirst({
    where: {
      title: { contains: action.idea_match, mode: "insensitive" },
      status: { in: ["seed", "developing"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!idea) {
    throw new Error(`No idea matched "${action.idea_match}".`);
  }

  const note = await prisma.ideaNote.create({
    data: {
      ideaId: idea.id,
      body: action.body,
      source: context.writeSource,
      captureId: context.captureId,
    },
  });

  return {
    type: "idea_note" as const,
    id: note.id,
    label: `Added to idea: ${idea.title}`,
  };
}

async function convertIdea(
  action: Extract<ExecutableAction, { type: "convert_idea" }>,
  context: ExecutionContext,
) {
  const idea = await prisma.idea.findFirst({
    where: {
      title: { contains: action.idea_match, mode: "insensitive" },
      status: { in: ["seed", "developing"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!idea) {
    throw new Error(`No idea matched "${action.idea_match}".`);
  }

  if (action.to === "project") {
    const project = await createProject(
      {
        type: "create_project",
        name: action.title ?? idea.title,
        area_match: action.area_match,
      },
      context,
    );

    await prisma.idea.update({
      where: { id: idea.id },
      data: {
        status: "converted",
        convertedToType: "project",
        convertedToId: project.id,
      },
    });

    return {
      ...project,
      label: `Converted idea to project: ${idea.title}`,
    };
  }

  const task = await createTask(
    {
      type: "create_task",
      title: action.title ?? idea.title,
      area_match: action.area_match,
      project_match: action.project_match,
    },
    context,
  );

  await prisma.idea.update({
    where: { id: idea.id },
    data: {
      status: "converted",
      convertedToType: "task",
      convertedToId: task.id,
    },
  });

  return {
    ...task,
    label: `Converted idea to task: ${idea.title}`,
  };
}

async function createReference(
  action: Extract<ExecutableAction, { type: "create_reference" }>,
  context: ExecutionContext,
) {
  const project = action.project_match
    ? await matchProject(action.project_match)
    : undefined;
  const reference = await prisma.reference.create({
    data: {
      body: action.body,
      url: action.url,
      tags: action.tags ?? [],
      areaId:
        project?.areaId ??
        matchAreaId(action.area_match, context.areas) ??
        context.inboxAreaId,
      projectId: project?.id,
      relatedType: action.related_match ? "unknown" : undefined,
      relatedId: action.related_match,
      source: context.writeSource,
      captureId: context.captureId,
    },
    include: { area: true, project: true },
  });

  return {
    type: "reference" as const,
    id: reference.id,
    label: `Reference saved to ${reference.project?.name ?? reference.area?.name ?? "Inbox"}`,
  };
}

async function createEntityNote(
  action: Extract<ExecutableAction, { type: "create_entity_note" }>,
  context: ExecutionContext,
) {
  const parent = await resolveEntityParent(
    action.parent_type,
    action.area_match,
    action.project_match,
    context,
  );

  const note = await prisma.entityNote.create({
    data: {
      parentType: parent.type,
      parentId: parent.id,
      bodyMd: action.body_md,
      source: context.writeSource,
      captureId: context.captureId,
    },
  });

  return {
    type: "entity_note" as const,
    id: note.id,
    label: `Note added to ${parent.label}`,
  };
}

async function createEntityDoc(
  action: Extract<ExecutableAction, { type: "create_entity_doc" }>,
  context: ExecutionContext,
) {
  const parent = await resolveEntityParent(
    action.parent_type,
    action.area_match,
    action.project_match,
    context,
  );

  const doc = await prisma.entityDoc.create({
    data: {
      parentType: parent.type,
      parentId: parent.id,
      title: action.title,
      bodyMd: action.body_md,
      source: context.writeSource,
      captureId: context.captureId,
    },
  });

  return {
    type: "entity_doc" as const,
    id: doc.id,
    label: `Doc added to ${parent.label}: ${doc.title}`,
  };
}

function matchDomain(
  domainMatch: string | undefined,
  domains: DomainContext[],
) {
  if (!domainMatch) {
    return undefined;
  }

  const normalized = normalizeMatch(domainMatch);
  return domains.find((domain) => normalizeMatch(domain.name) === normalized);
}

function matchAreaId(
  areaMatch: string | undefined,
  areas: AreaContext[],
) {
  if (!areaMatch) {
    return undefined;
  }

  const normalized = normalizeMatch(areaMatch);
  const exact = areas.find((area) => normalizeMatch(area.name) === normalized);
  if (exact) return exact.id;

  return areas.find((area) => normalizeMatch(area.name).includes(normalized))?.id;
}

async function matchProjectId(projectMatch: string) {
  const project = await matchProject(projectMatch);
  return project?.id;
}

async function matchProject(projectMatch: string) {
  const project = await prisma.project.findFirst({
    where: {
      status: { in: ["active", "someday", "parked"] },
      name: { contains: projectMatch, mode: "insensitive" },
    },
    select: { id: true, areaId: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  return project;
}

async function executeCreatePerson(
  action: Extract<ExecutableAction, { type: "create_person" }>,
  context: ExecutionContext,
) {
  const person = await createPersonRecord(
    {
      name: action.name,
      relationshipType: action.relationship_type,
      email: action.email,
      phone: action.phone,
      company: action.company,
      areaId: matchAreaId(action.area_match, context.areas),
    },
    context.actor,
  );

  return {
    type: "person" as const,
    id: person.id,
    label: `Person added: ${person.name}`,
  };
}

async function resolveOrCreatePerson(
  personMatch: string,
  context: ExecutionContext,
): Promise<{ person: { id: string; name: string }; created: boolean }> {
  const existing = await findPersonByMatch(personMatch);
  if (existing) {
    return { person: existing, created: false };
  }
  const person = await createPersonRecord({ name: personMatch }, context.actor);
  return { person, created: true };
}

async function executeCreatePersonFact(
  action: Extract<ExecutableAction, { type: "create_person_fact" }>,
  context: ExecutionContext,
) {
  const { person, created } = await resolveOrCreatePerson(
    action.person_match,
    context,
  );

  const fact = await prisma.personFact.create({
    data: {
      personId: person.id,
      factType: action.fact_type ?? "note",
      factValue: action.fact_value,
      dateRelevant: parseDateOnly(action.date_relevant),
      recurring: action.recurring ?? false,
      captureId: context.captureId,
    },
  });

  const items: CreatedItemRef[] = [];
  if (created) {
    items.push({
      type: "person",
      id: person.id,
      label: `Person added: ${person.name}`,
    });
  }
  items.push({
    type: "person_fact",
    id: fact.id,
    label: `Fact saved for ${person.name}`,
  });
  return items;
}

async function executeLogInteraction(
  action: Extract<ExecutableAction, { type: "log_interaction" }>,
  context: ExecutionContext,
) {
  const { person, created } = await resolveOrCreatePerson(
    action.person_match,
    context,
  );

  const interaction = await prisma.personInteraction.create({
    data: {
      personId: person.id,
      interactionType: action.interaction_type ?? "touchpoint",
      notesMd: action.notes,
      occurredAt: action.occurred_at
        ? parseDateTime(action.occurred_at)
        : new Date(),
      source: "capture",
      captureId: context.captureId,
    },
  });

  const items: CreatedItemRef[] = [];
  if (created) {
    items.push({
      type: "person",
      id: person.id,
      label: `Person added: ${person.name}`,
    });
  }
  items.push({
    type: "person_interaction",
    id: interaction.id,
    label: `Interaction logged for ${person.name}`,
  });
  return items;
}

async function executeCreateRoutine(
  action: Extract<ExecutableAction, { type: "create_routine" }>,
  context: ExecutionContext,
) {
  const areaId = matchAreaId(action.area_match, context.areas);
  const frequency =
    action.frequency ??
    (action.days && action.days.length > 0 ? "custom" : "daily");

  const routine = await prisma.routine.create({
    data: {
      name: action.name,
      description: action.description,
      areaId,
      schedule: {
        frequency,
        days: action.days ?? [],
        timeWindow: action.time_window ?? "anytime",
      },
      goal:
        typeof action.times_per_week === "number"
          ? { timesPerWeek: action.times_per_week }
          : undefined,
      graceWindow:
        typeof action.grace_days === "number"
          ? { days: action.grace_days }
          : undefined,
      temporary: action.temporary ?? false,
      startDate: parseDateOnly(action.start_date),
      endDate: parseDateOnly(action.end_date),
    },
  });

  return {
    type: "routine" as const,
    id: routine.id,
    label: `Routine created: ${routine.name}`,
  };
}

async function executeScheduleReview(
  action: Extract<ExecutableAction, { type: "schedule_review" }>,
  context: ExecutionContext,
) {
  const reviewAt = parseDateOnly(action.review_at);
  const conditionText = action.review_condition_text?.trim() || undefined;
  if (!reviewAt && !conditionText) {
    throw new Error("schedule_review needs a date or a condition.");
  }

  const review = await prisma.scheduledReview.create({
    data: {
      captureId: context.captureId,
      reviewAt,
      conditionText,
    },
  });

  return {
    type: "scheduled_review" as const,
    id: review.id,
    label: reviewAt
      ? `Review scheduled for ${reviewAt.toISOString().slice(0, 10)}`
      : `Review scheduled (when: ${conditionText})`,
  };
}

async function executeJournal(
  action: Extract<ExecutableAction, { type: "journal" }>,
  context: ExecutionContext,
) {
  const today = new Date(`${localDateString()}T00:00:00.000Z`);
  const entry = await prisma.journalEntry.create({
    data: {
      entryDate: parseDateOnly(action.entry_date) ?? today,
      bodyMd: action.body_md,
      source: context.captureSource === "in_app_voice" ? "voice" : "typed",
      tags: action.tags ?? [],
      captureId: context.captureId,
    },
  });

  return {
    type: "journal_entry" as const,
    id: entry.id,
    label: "Journal entry saved",
  };
}

async function executeCheckIn(
  action: Extract<ExecutableAction, { type: "check_in" }>,
  context: ExecutionContext,
) {
  // Resolve the parent: explicit parent_type wins; otherwise try the
  // project match first, then the area match.
  let parent: { type: "area" | "project"; id: string; label: string } | null =
    null;

  if (action.parent_type) {
    parent = await resolveEntityParent(
      action.parent_type,
      action.area_match,
      action.project_match,
      context,
    );
  } else {
    if (action.project_match) {
      const project = await matchProject(action.project_match);
      if (project) {
        parent = { type: "project", id: project.id, label: project.name };
      }
    }
    if (!parent) {
      const match = action.area_match ?? action.project_match;
      const areaId = matchAreaId(match, context.areas);
      if (areaId) {
        const area = context.areas.find((candidate) => candidate.id === areaId);
        parent = { type: "area", id: areaId, label: area?.name ?? "area" };
      }
    }
  }

  if (!parent) {
    throw new Error(
      `No project or area matched "${action.project_match ?? action.area_match ?? ""}" for check-in.`,
    );
  }

  const { checkIn } = await createCheckInRecord(
    {
      parentType: parent.type,
      parentId: parent.id,
      bodyMd: action.body_md,
      source: context.captureSource === "in_app_voice" ? "voice" : "manual",
      captureId: context.captureId,
    },
    context.actor,
  );

  return {
    type: "check_in" as const,
    id: checkIn.id,
    label: `Check-in posted to ${parent.label}`,
  };
}

async function resolveEntityParent(
  parentType: "area" | "project",
  areaMatch: string | undefined,
  projectMatch: string | undefined,
  context: ExecutionContext,
) {
  if (parentType === "project") {
    if (!projectMatch) {
      throw new Error("Project note/doc requires project_match.");
    }

    const project = await matchProject(projectMatch);
    if (!project) {
      throw new Error(`No project matched "${projectMatch}".`);
    }

    return { type: "project" as const, id: project.id, label: project.name };
  }

  const areaId = matchAreaId(areaMatch, context.areas);
  if (!areaId) {
    throw new Error(`No area matched "${areaMatch ?? ""}".`);
  }

  const area = context.areas.find((candidate) => candidate.id === areaId);
  return { type: "area" as const, id: areaId, label: area?.name ?? "area" };
}

function normalizeMatch(value: string) {
  return value.trim().toLowerCase();
}

function parseDateOnly(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function parseDateTime(value: string) {
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date/time: ${value}`);
  }

  return parsed;
}

function buildConfirmationMessage(
  status: "parsed" | "ambiguous" | "failed",
  createdItems: CreatedItemRef[],
) {
  const visibleItems = createdItems.filter((item) => item.type !== "notification");
  if (status === "ambiguous") {
    return "Saved to Inbox to sort later";
  }

  if (status === "failed") {
    return "Saved to Inbox to sort later";
  }

  return formatCreatedItems(visibleItems);
}

function formatCreatedItems(items: CreatedItemRef[]) {
  if (items.length === 0) {
    return "Capture saved.";
  }

  return items.map((item) => item.label).join("; ");
}
