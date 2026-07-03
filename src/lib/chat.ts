import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { checkInSnippet } from "@/lib/checkins";
import {
  addDaysToDateString,
  formatDateOnly,
  localDateString,
} from "@/lib/dates";
import { getTaskSlipDays, projectLastActivityFact, taskOpenSinceFact } from "@/lib/slippage";

const DEFAULT_CHAT_MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 6;

export type ChatResult =
  | { ok: true; answer: string }
  | { ok: false; reason: string };

const chatSystemPrompt = `You answer questions about Matt's personal operations data (Home Base).
Use the tools to look things up — never invent records. This surface is read-only: you cannot create, change, or complete anything; if asked to, say writes happen through capture.
Cite the records you used as inline markdown links, e.g. [the APRS build](/projects/<id>) or [journal, Jun 2](/ideas). Use the href fields returned by tools.
Be plain and factual. No advice, no scores, no guilt. Short answers; bullets only when listing several records.`;

// ---- capability set (mirrors the MCP server's read surface) ----

const tools: Anthropic.Tool[] = [
  {
    name: "search",
    description:
      "Full-text search across captures, tasks, projects, ideas, references, notes, docs, check-ins, journal entries, and people. Returns typed results with hrefs.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "all_clear_summary",
    description:
      "Today/tomorrow status: due counts, next commitment, open task total.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "list_slipping",
    description:
      "Everything currently slipping: long-open tasks (past the slip threshold) and active projects past their per-project inactivity threshold.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "read_person",
    description:
      "A person's profile, facts, and recent interactions, matched fuzzily by name.",
    input_schema: {
      type: "object" as const,
      properties: { person_match: { type: "string" } },
      required: ["person_match"],
    },
  },
  {
    name: "read_journal",
    description:
      "Journal entries, newest first, optionally filtered by a text query.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "read_project",
    description:
      "A project's status, check-ins, milestones, and open tasks, matched fuzzily by name.",
    input_schema: {
      type: "object" as const,
      properties: { project_match: { type: "string" } },
      required: ["project_match"],
    },
  },
  {
    name: "list_tasks",
    description: "Open tasks, optionally only those due through today.",
    input_schema: {
      type: "object" as const,
      properties: {
        due_through_today: { type: "boolean" },
        limit: { type: "number" },
      },
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>) {
  switch (name) {
    case "search":
      return toolSearch(String(input.query ?? ""));
    case "all_clear_summary":
      return toolAllClear();
    case "list_slipping":
      return toolSlipping();
    case "read_person":
      return toolPerson(String(input.person_match ?? ""));
    case "read_journal":
      return toolJournal(
        typeof input.query === "string" ? input.query : undefined,
        typeof input.limit === "number" ? input.limit : 10,
      );
    case "read_project":
      return toolProject(String(input.project_match ?? ""));
    case "list_tasks":
      return toolTasks(
        input.due_through_today === true,
        typeof input.limit === "number" ? input.limit : 25,
      );
    default:
      return { error: `Unknown tool ${name}.` };
  }
}

async function toolSearch(query: string) {
  if (!query.trim()) return { results: [] };
  const like = { contains: query, mode: "insensitive" as const };
  const [tasks, projects, ideas, journal, checkIns, people, captures] =
    await Promise.all([
      prisma.task.findMany({
        where: { OR: [{ title: like }, { notes: like }] },
        select: { id: true, title: true, status: true },
        take: 8,
      }),
      prisma.project.findMany({
        where: { name: like },
        select: { id: true, name: true, status: true },
        take: 8,
      }),
      prisma.idea.findMany({
        where: { OR: [{ title: like }, { body: like }] },
        select: { id: true, title: true, status: true },
        take: 8,
      }),
      prisma.journalEntry.findMany({
        where: { bodyMd: like },
        select: { id: true, bodyMd: true, entryDate: true },
        take: 8,
      }),
      prisma.checkIn.findMany({
        where: { bodyMd: like },
        select: { id: true, bodyMd: true, parentType: true, parentId: true, createdAt: true },
        take: 8,
      }),
      prisma.person.findMany({
        where: { name: like },
        select: { id: true, name: true },
        take: 5,
      }),
      prisma.capture.findMany({
        where: { rawText: like },
        select: { id: true, rawText: true, createdAt: true },
        take: 5,
      }),
    ]);

  return {
    results: [
      ...tasks.map((task) => ({
        type: "task",
        title: task.title,
        status: task.status,
        href: `/tasks/${task.id}`,
      })),
      ...projects.map((project) => ({
        type: "project",
        title: project.name,
        status: project.status,
        href: `/projects/${project.id}`,
      })),
      ...ideas.map((idea) => ({
        type: "idea",
        title: idea.title,
        status: idea.status,
        href: "/ideas",
      })),
      ...journal.map((entry) => ({
        type: "journal",
        date: entry.entryDate.toISOString().slice(0, 10),
        excerpt: checkInSnippet(entry.bodyMd, 160),
        href: "/ideas",
      })),
      ...checkIns.map((checkIn) => ({
        type: "check_in",
        excerpt: checkInSnippet(checkIn.bodyMd, 160),
        href:
          checkIn.parentType === "project"
            ? `/projects/${checkIn.parentId}`
            : `/areas/${checkIn.parentId}`,
      })),
      ...people.map((person) => ({
        type: "person",
        title: person.name,
        href: `/people/${person.id}`,
      })),
      ...captures.map((capture) => ({
        type: "capture",
        excerpt: checkInSnippet(capture.rawText, 160),
        href: `/search?q=${encodeURIComponent(capture.rawText.slice(0, 60))}`,
      })),
    ],
  };
}

async function toolAllClear() {
  const today = localDateString();
  const tomorrow = addDaysToDateString(today, 1);
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const tomorrowDate = new Date(`${tomorrow}T00:00:00.000Z`);

  const [dueToday, dueTomorrow, openTasks, nextEvent] = await Promise.all([
    prisma.task.count({
      where: { status: "open", someday: false, dueDate: { lte: todayDate } },
    }),
    prisma.task.count({
      where: { status: "open", someday: false, dueDate: tomorrowDate },
    }),
    prisma.task.count({ where: { status: "open" } }),
    prisma.calendarEvent.findFirst({
      where: { start: { gte: new Date() }, status: { not: "cancelled" } },
      orderBy: { start: "asc" },
      select: { title: true, start: true },
    }),
  ]);

  return {
    due_today: dueToday,
    due_tomorrow: dueTomorrow,
    open_tasks_total: openTasks,
    next_commitment: nextEvent
      ? { title: nextEvent.title, start: nextEvent.start }
      : null,
  };
}

async function toolSlipping() {
  const slipDays = await getTaskSlipDays();
  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: { status: "open", someday: false },
      select: {
        id: true,
        title: true,
        status: true,
        someday: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 300,
    }),
    prisma.project.findMany({
      where: { status: "active" },
      select: {
        id: true,
        name: true,
        status: true,
        slipThresholdDays: true,
        activity: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        tasks: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
      },
      take: 100,
    }),
  ]);

  const slippingTasks = tasks.flatMap((task) => {
    const fact = taskOpenSinceFact(task, slipDays);
    return fact
      ? [{ title: task.title, fact, href: `/tasks/${task.id}` }]
      : [];
  });

  const projectIds = projects.map((project) => project.id);
  const latestCheckIns = projectIds.length
    ? await prisma.checkIn.findMany({
        where: { parentType: "project", parentId: { in: projectIds } },
        orderBy: { createdAt: "desc" },
        distinct: ["parentId"],
        select: { parentId: true, createdAt: true },
      })
    : [];
  const checkInByProject = new Map(
    latestCheckIns.map((checkIn) => [checkIn.parentId, checkIn.createdAt]),
  );

  const slippingProjects = projects.flatMap((project) => {
    const dates = [
      project.activity[0]?.createdAt,
      project.tasks[0]?.updatedAt,
      checkInByProject.get(project.id),
    ].filter((date): date is Date => Boolean(date));
    const lastActivity = dates.sort((a, b) => Number(b) - Number(a))[0] ?? null;
    const fact = projectLastActivityFact(project, lastActivity);
    return fact
      ? [{ name: project.name, fact, href: `/projects/${project.id}` }]
      : [];
  });

  return { slipping_tasks: slippingTasks, slipping_projects: slippingProjects };
}

async function toolPerson(personMatch: string) {
  const person = await prisma.person.findFirst({
    where: { name: { contains: personMatch, mode: "insensitive" } },
    include: {
      facts: { orderBy: { createdAt: "desc" }, take: 20 },
      interactions: { orderBy: { occurredAt: "desc" }, take: 20 },
    },
  });
  if (!person) return { found: false };

  return {
    found: true,
    href: `/people/${person.id}`,
    name: person.name,
    relationship: person.relationshipType,
    company: person.company,
    facts: person.facts.map((fact) => ({
      value: fact.factValue,
      date: fact.dateRelevant?.toISOString().slice(0, 10) ?? null,
      recurring: fact.recurring,
    })),
    interactions: person.interactions.map((interaction) => ({
      type: interaction.interactionType,
      notes: interaction.notesMd,
      occurred_at: interaction.occurredAt,
      source: interaction.source,
    })),
  };
}

async function toolJournal(query: string | undefined, limit: number) {
  const entries = await prisma.journalEntry.findMany({
    where: {
      status: "active",
      ...(query
        ? { bodyMd: { contains: query, mode: "insensitive" } }
        : {}),
    },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(limit, 1), 30),
  });

  return {
    entries: entries.map((entry) => ({
      date: entry.entryDate.toISOString().slice(0, 10),
      body: entry.bodyMd,
      source: entry.source,
      href: "/ideas",
    })),
  };
}

async function toolProject(projectMatch: string) {
  const project = await prisma.project.findFirst({
    where: { name: { contains: projectMatch, mode: "insensitive" } },
    include: {
      area: { include: { domain: true } },
      milestones: { orderBy: { sortOrder: "asc" } },
      tasks: {
        where: { status: "open" },
        select: { id: true, title: true, dueDate: true },
        take: 15,
      },
    },
  });
  if (!project) return { found: false };

  const checkIns = await prisma.checkIn.findMany({
    where: { parentType: "project", parentId: project.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { bodyMd: true, createdAt: true },
  });

  return {
    found: true,
    href: `/projects/${project.id}`,
    name: project.name,
    status: project.status,
    domain: project.area.domain.name,
    area: project.area.name,
    target_date: project.targetDate?.toISOString().slice(0, 10) ?? null,
    milestones: project.milestones.map((milestone) => ({
      title: milestone.title,
      status: milestone.status,
    })),
    open_tasks: project.tasks.map((task) => ({
      title: task.title,
      due: task.dueDate ? formatDateOnly(task.dueDate) : null,
      href: `/tasks/${task.id}`,
    })),
    check_ins: checkIns.map((checkIn) => ({
      body: checkIn.bodyMd,
      at: checkIn.createdAt,
    })),
  };
}

async function toolTasks(dueThroughToday: boolean, limit: number) {
  const today = new Date(`${localDateString()}T00:00:00.000Z`);
  const tasks = await prisma.task.findMany({
    where: {
      status: "open",
      someday: false,
      ...(dueThroughToday ? { dueDate: { lte: today } } : {}),
    },
    include: { area: true, project: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: Math.min(Math.max(limit, 1), 50),
  });

  return {
    tasks: tasks.map((task) => ({
      title: task.title,
      due: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
      starred: task.starred,
      area: task.area.name,
      project: task.project?.name ?? null,
      href: `/tasks/${task.id}`,
    })),
  };
}

// ---- chat loop ----

export async function answerDataQuestion(
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<ChatResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_CHAT_MODEL ?? DEFAULT_CHAT_MODEL;
  if (!apiKey) {
    return {
      ok: false,
      reason:
        "Data chat is not configured. Set ANTHROPIC_API_KEY in the deployment environment.",
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-8).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user" as const, content: question },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1200,
      system: chatSystemPrompt,
      tools,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const answer = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      return answer
        ? { ok: true, answer }
        : { ok: false, reason: "The model returned an empty answer." };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = await runTool(
        block.name,
        (block.input ?? {}) as Record<string, unknown>,
      ).catch((error: unknown) => ({
        error: error instanceof Error ? error.message : "Tool failed.",
      }));
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  return { ok: false, reason: "The question needed too many lookups." };
}
