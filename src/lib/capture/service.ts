import { Prisma, type CaptureParseStatus } from "@prisma/client";
import { addHours, parseISO } from "date-fns";
import { prisma } from "@/lib/db";
import { parseCaptureWithContext } from "@/lib/capture/parser";
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
};

type ExecutionContext = {
  captureId: string;
  rawText: string;
  inboxDomainId: string;
  domains: DomainContext[];
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
      inboxDomainId: await getInboxDomainId(),
      domains: parserContext.domains,
    };

    if (status === "parsed" && executableActions.length > 0) {
      createdItems = await executeActions(executableActions, context);
    } else {
      createdItems = await createInboxFallbackTask(context);
    }
  } catch (error) {
    status = "failed";
    actions = [
      {
        error: error instanceof Error ? error.message : "Capture parsing failed.",
      },
    ];

    createdItems = await createInboxFallbackTask({
      captureId: capture.id,
      rawText: parsedInput.rawText,
      inboxDomainId: await getInboxDomainId(),
      domains: [],
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
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { status: { in: ["active", "parked"] } },
      include: { domain: { select: { name: true } } },
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

  return {
    now: new Date().toISOString(),
    timezone: "America/New_York" as const,
    source,
    domains,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      domain: project.domain.name,
      current_state: project.currentState,
    })),
    recentIdeas,
  };
}

function isExecutableAction(action: ParserAction): action is ExecutableAction {
  return "type" in action;
}

async function getInboxDomainId() {
  const inbox = await prisma.domain.upsert({
    where: { name: "Inbox" },
    update: { active: true, isSystem: true },
    create: {
      name: "Inbox",
      description: "System catch-all for genuinely ambiguous captures.",
      sortOrder: 0,
      isSystem: true,
      active: true,
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
        const completed = await completeTask(action.task_match);
        createdItems.push(completed);
        break;
      }
      case "create_project":
        createdItems.push(await createProject(action, context));
        break;
      case "update_project_state":
        createdItems.push(...(await updateProjectState(action, context)));
        break;
      case "create_calendar_event":
        createdItems.push(await createCalendarEvent(action, context.captureId));
        break;
      case "create_idea":
        createdItems.push(await createIdea(action, context));
        break;
      case "append_to_idea":
        createdItems.push(await appendToIdea(action, context.captureId));
        break;
      case "convert_idea":
        createdItems.push(await convertIdea(action, context));
        break;
      case "create_reference":
        createdItems.push(await createReference(action, context));
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

async function createInboxFallbackTask(context: ExecutionContext) {
  const task = await prisma.task.create({
    data: {
      title: context.rawText,
      domainId: context.inboxDomainId,
      source: "capture_fallback",
      captureId: context.captureId,
    },
  });

  const notification = await prisma.notification.create({
    data: {
      type: "capture_needs_review",
      title: "Capture saved to Inbox",
      body: "Parser could not confidently route this capture.",
      sourceRef: { type: "capture", id: context.captureId },
    },
  });

  return [
    {
      type: "task" as const,
      id: task.id,
      label: `Inbox task: ${task.title}`,
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
  const domainId =
    matchDomainId(action.domain_match, context.domains) ?? context.inboxDomainId;
  const projectId = action.project_match
    ? await matchProjectId(action.project_match)
    : undefined;

  const task = await prisma.task.create({
    data: {
      title: action.title,
      notes: action.notes,
      dueDate: parseDateOnly(action.due_date),
      dueTime: action.due_time,
      priority: action.priority,
      reminderOffsets: action.reminder_offsets as Prisma.InputJsonValue,
      domainId,
      projectId,
      source: "capture",
      captureId: context.captureId,
    },
    include: { domain: true },
  });

  return {
    type: "task" as const,
    id: task.id,
    label: `Task in ${task.domain.name}: ${task.title}`,
  };
}

async function completeTask(taskMatch: string) {
  const task = await prisma.task.findFirst({
    where: {
      status: "open",
      title: { contains: taskMatch, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!task) {
    throw new Error(`No open task matched "${taskMatch}".`);
  }

  const completed = await prisma.task.update({
    where: { id: task.id },
    data: { status: "completed", completedAt: new Date() },
  });

  return {
    type: "task" as const,
    id: completed.id,
    label: `Completed task: ${completed.title}`,
  };
}

async function createProject(
  action: Extract<ExecutableAction, { type: "create_project" }>,
  context: ExecutionContext,
) {
  const domainId =
    matchDomainId(action.domain_match, context.domains) ?? context.inboxDomainId;

  const project = await prisma.project.create({
    data: {
      name: action.name,
      domainId,
      targetDate: parseDateOnly(action.target_date),
      currentState: "Created from capture. Current state needs detail.",
      nextStep: "Define the next physical step.",
      activity: {
        create: {
          entry: `Project created from capture: ${context.rawText}`,
          source: "capture",
          captureId: context.captureId,
        },
      },
    },
    include: { domain: true },
  });

  return {
    type: "project" as const,
    id: project.id,
    label: `Project in ${project.domain.name}: ${project.name}`,
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
      parkedAt: action.status === "parked" ? now : undefined,
      completedAt: action.status === "completed" ? now : undefined,
      killedAt: action.status === "killed" ? now : undefined,
    },
  });

  const activity = await prisma.projectActivity.create({
    data: {
      projectId,
      entry: action.log_entry ?? context.rawText,
      source: "capture",
      captureId: context.captureId,
      stateSnapshot: {
        status: project.status,
        current_state: project.currentState,
        next_step: project.nextStep,
      },
    },
  });

  return [
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
}

async function createCalendarEvent(
  action: Extract<ExecutableAction, { type: "create_calendar_event" }>,
  captureId: string,
) {
  const event = await prisma.calendarEvent.create({
    data: {
      title: action.title,
      start: parseDateTime(action.start),
      end: parseDateTime(action.end),
      location: action.location,
      source: "capture",
      captureId,
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
  const idea = await prisma.idea.create({
    data: {
      title: action.title,
      body: action.body,
      tags: action.tags ?? [],
      domainId: matchDomainId(action.domain_match, context.domains),
      captureId: context.captureId,
    },
  });

  return {
    type: "idea" as const,
    id: idea.id,
    label: `Idea captured: ${idea.title}`,
  };
}

async function appendToIdea(
  action: Extract<ExecutableAction, { type: "append_to_idea" }>,
  captureId: string,
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
      captureId,
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
        domain_match: action.domain_match,
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
      domain_match: action.domain_match,
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
  const reference = await prisma.reference.create({
    data: {
      body: action.body,
      url: action.url,
      tags: action.tags ?? [],
      domainId: matchDomainId(action.domain_match, context.domains),
      relatedType: action.related_match ? "unknown" : undefined,
      relatedId: action.related_match,
      captureId: context.captureId,
    },
  });

  return {
    type: "reference" as const,
    id: reference.id,
    label: "Reference captured",
  };
}

function matchDomainId(
  domainMatch: string | undefined,
  domains: DomainContext[],
) {
  if (!domainMatch) {
    return undefined;
  }

  const normalized = normalizeMatch(domainMatch);
  return domains.find((domain) => normalizeMatch(domain.name) === normalized)?.id;
}

async function matchProjectId(projectMatch: string) {
  const project = await prisma.project.findFirst({
    where: {
      status: { in: ["active", "parked"] },
      name: { contains: projectMatch, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
  });

  return project?.id;
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
    return `Saved to Inbox for review. ${formatCreatedItems(visibleItems)}`;
  }

  if (status === "failed") {
    return `Capture saved. Parser failed, so it landed in Inbox. ${formatCreatedItems(visibleItems)}`;
  }

  return formatCreatedItems(visibleItems);
}

function formatCreatedItems(items: CreatedItemRef[]) {
  if (items.length === 0) {
    return "Capture saved.";
  }

  return items.map((item) => item.label).join("; ");
}
