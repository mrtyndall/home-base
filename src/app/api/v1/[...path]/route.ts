import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  ApiAuthError,
  authenticateApiRequest,
  type AuthenticatedApiKey,
} from "@/lib/api/auth";
import { submitCapture } from "@/lib/capture/service";
import { prisma } from "@/lib/db";
import { getTodayDashboard } from "@/lib/today";
import { completeTaskById, createTaskWithAudit } from "@/lib/tasks";

type RouteCtx = {
  params: Promise<{ path?: string[] }>;
};

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  q: z.string().optional(),
});

export async function GET(request: Request, context: RouteCtx) {
  return handleApi(request, context, "read", async ({ path, url }) => {
    const [resource, id, action] = path;

    if (resource === "today") {
      return getTodayDashboard();
    }

    if (resource === "search") {
      const query = url.searchParams.get("q")?.trim() ?? "";
      return runSearch(query);
    }

    if (resource === "domains") {
      if (id) {
        return {
          domain: await prisma.domain.findUnique({
            where: { id },
            include: { areas: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
          }),
        };
      }

      return {
        domains: await prisma.domain.findMany({
          where: { active: true },
          include: { areas: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
      };
    }

    if (resource === "areas") {
      if (id) {
        return {
          area: await prisma.area.findUnique({
            where: { id },
            include: {
              domain: true,
              tasks: { where: { status: "open" }, orderBy: { createdAt: "desc" } },
              projects: { orderBy: { createdAt: "desc" } },
              ideas: { orderBy: { updatedAt: "desc" } },
            },
          }),
          notes: await prisma.entityNote.findMany({
            where: { parentType: "area", parentId: id },
            orderBy: { createdAt: "desc" },
          }),
          docs: await prisma.entityDoc.findMany({
            where: { parentType: "area", parentId: id },
            orderBy: { updatedAt: "desc" },
          }),
          attachments: await prisma.document.findMany({
            where: { parentType: "area", parentId: id },
            orderBy: { createdAt: "desc" },
          }),
        };
      }

      return {
        areas: await prisma.area.findMany({
          include: { domain: true },
          orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
          take: 100,
        }),
      };
    }

    if (resource === "captures") {
      const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));
      return {
        captures: await prisma.capture.findMany({
          orderBy: { createdAt: "desc" },
          take: query.limit,
          ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        }),
      };
    }

    if (resource === "tasks") {
      if (id) {
        return {
          task: await prisma.task.findUnique({
            where: { id },
            include: { area: true, project: true, subtasks: true },
          }),
        };
      }

      const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));
      return {
        tasks: await prisma.task.findMany({
          where: query.q
            ? { title: { contains: query.q, mode: "insensitive" } }
            : undefined,
          include: { area: true, project: true, subtasks: true },
          orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
          take: query.limit,
          ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        }),
      };
    }

    if (resource === "projects") {
      if (id && action === "activity") {
        return {
          activity: await prisma.projectActivity.findMany({
            where: { projectId: id },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
        };
      }

      if (id) {
        return {
          project: await prisma.project.findUnique({
            where: { id },
            include: {
              area: true,
              activity: { orderBy: { createdAt: "desc" }, take: 20 },
              milestones: { orderBy: [{ status: "asc" }, { sortOrder: "asc" }] },
            },
          }),
        };
      }

      return {
        projects: await prisma.project.findMany({
          include: { area: true },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 100,
        }),
      };
    }

    if (resource === "ideas") {
      if (id && action === "notes") {
        return {
          notes: await prisma.ideaNote.findMany({
            where: { ideaId: id },
            orderBy: { createdAt: "desc" },
          }),
        };
      }

      if (id) {
        return {
          idea: await prisma.idea.findUnique({
            where: { id },
            include: {
              area: true,
              project: true,
              notes: { orderBy: { createdAt: "desc" } },
            },
          }),
        };
      }

      return {
        ideas: await prisma.idea.findMany({
          include: { area: true, project: true },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
      };
    }

    if (resource === "references") {
      if (id) {
        return {
          reference: await prisma.reference.findUnique({
            where: { id },
            include: { area: true, project: true },
          }),
        };
      }

      return {
        references: await prisma.reference.findMany({
          include: { area: true, project: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      };
    }

    if (resource === "calendar-events") {
      if (id) {
        return {
          event: await prisma.calendarEvent.findUnique({ where: { id } }),
        };
      }

      return {
        events: await prisma.calendarEvent.findMany({
          orderBy: { start: "asc" },
          take: 100,
        }),
      };
    }

    if (resource === "notifications") {
      return {
        notifications: await prisma.notification.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      };
    }

    if (resource === "entity-notes") {
      return {
        notes: await prisma.entityNote.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      };
    }

    if (resource === "entity-docs") {
      return {
        docs: await prisma.entityDoc.findMany({
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
      };
    }

    if (resource === "milestones") {
      return {
        milestones: await prisma.milestone.findMany({
          orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
          take: 100,
        }),
      };
    }

    return notFound();
  });
}

export async function POST(request: Request, context: RouteCtx) {
  const path = (await context.params).path ?? [];
  const requiredScope = path[0] === "captures" ? "capture" : "write";
  return handleApi(request, context, requiredScope, async ({ apiKey, path }) => {
    const [resource, id, action] = path;
    const body = await readJson(request);

    if (resource === "captures") {
      const parsed = apiCaptureSchema.parse(body);
      return submitCapture({
        rawText: parsed.rawText,
        source: "api",
        deviceContext: {
          apiKeyLabel: apiKey.label,
          ...(parsed.deviceContext ?? {}),
        },
      });
    }

    if (resource === "tasks" && id && action === "complete") {
      const result = await completeTaskById(id, {
        source: "api",
        label: apiKey.label,
      });
      return result;
    }

    if (resource === "tasks") {
      const parsed = createTaskSchema.parse(body);
      const project = parsed.projectId
        ? await prisma.project.findUnique({
            where: { id: parsed.projectId },
            select: { areaId: true },
          })
        : null;
      const areaId = project?.areaId ?? (await resolveAreaId(parsed.areaId, parsed.areaName));
      const task = await createTaskWithAudit(
        {
          title: parsed.title,
          notes: parsed.notes,
          dueDate: parseDateOnly(parsed.dueDate),
          dueTime: parsed.dueTime,
          priority: parsed.priority,
          areaId,
          projectId: parsed.projectId,
          parentTaskId: parsed.parentTaskId,
          someday: parsed.someday,
          recurrenceRule: parsed.recurrenceRule,
          reminderOffsets: parsed.reminderOffsets as Prisma.InputJsonValue,
          source: `api:${apiKey.label}`,
        },
        { source: "api", label: apiKey.label },
      );
      return { task };
    }

    if (resource === "areas") {
      const parsed = createAreaSchema.parse(body);
      const domainId = await resolveDomainId(parsed.domainId, parsed.domainName);
      const area = await prisma.area.create({
        data: {
          name: parsed.name,
          domainId,
          status: parsed.status ?? "active",
          currentState: parsed.currentState,
          nextStep: parsed.nextStep,
          tendingCadence: parsed.tendingCadence,
          sortOrder: parsed.sortOrder,
        },
      });
      await auditApiWrite(apiKey, "area_created", "Area created", {
        type: "area",
        id: area.id,
      });
      return { area };
    }

    if (resource === "projects" && id && action === "activity") {
      const parsed = z.object({ entry: z.string().min(1) }).parse(body);
      const activity = await prisma.projectActivity.create({
        data: {
          projectId: id,
          entry: parsed.entry,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "project_activity_created", "Project activity logged", {
        type: "project_activity",
        id: activity.id,
        projectId: id,
      });
      return { activity };
    }

    if (resource === "projects") {
      const parsed = createProjectSchema.parse(body);
      const areaId = await resolveAreaId(parsed.areaId, parsed.areaName);
      const now = new Date();
      const status = parsed.status ?? "active";
      const project = await prisma.project.create({
        data: {
          name: parsed.name,
          areaId,
          status,
          targetDate: parseDateOnly(parsed.targetDate),
          parkedAt: status === "parked" ? now : undefined,
          completedAt: status === "completed" ? now : undefined,
          killedAt: status === "killed" ? now : undefined,
          currentState: parsed.currentState,
          nextStep: parsed.nextStep,
          activity: {
            create: {
              entry: "Project created through API.",
              source: `api:${apiKey.label}`,
              stateSnapshot: {
                current_state: parsed.currentState ?? null,
                next_step: parsed.nextStep ?? null,
                status,
              },
            },
          },
        },
      });
      await auditApiWrite(apiKey, "project_created", "Project created", {
        type: "project",
        id: project.id,
      });
      return { project };
    }

    if (resource === "ideas" && id && action === "notes") {
      const parsed = z.object({ body: z.string().min(1) }).parse(body);
      const note = await prisma.ideaNote.create({
        data: {
          ideaId: id,
          body: parsed.body,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "idea_note_created", "Idea note added", {
        type: "idea_note",
        id: note.id,
        ideaId: id,
      });
      return { note };
    }

    if (resource === "ideas" && id && action === "convert") {
      const parsed = z.object({ to: z.enum(["task", "project"]), title: z.string().optional(), areaId: z.string().optional() }).parse(body);
      const idea = await prisma.idea.findUnique({ where: { id } });
      if (!idea) return notFound();
      if (parsed.to === "task") {
        const task = await createTaskWithAudit(
          {
            title: parsed.title ?? idea.title,
            notes: idea.body,
            areaId: parsed.areaId ?? idea.areaId ?? (await getInboxAreaId()),
            source: `api:${apiKey.label}`,
          },
          { source: "api", label: apiKey.label },
        );
        await prisma.idea.update({
          where: { id },
          data: { status: "converted", convertedToType: "task", convertedToId: task.id },
        });
        return { task };
      }

      const project = await prisma.project.create({
        data: {
          name: parsed.title ?? idea.title,
          areaId: parsed.areaId ?? idea.areaId ?? (await getInboxAreaId()),
          currentState: idea.body ?? "Converted from idea.",
          activity: { create: { entry: "Converted from idea through API.", source: `api:${apiKey.label}` } },
        },
      });
      await prisma.idea.update({
        where: { id },
        data: { status: "converted", convertedToType: "project", convertedToId: project.id },
      });
      await auditApiWrite(apiKey, "idea_converted", "Idea converted", { type: "idea", id, to: parsed.to });
      return { project };
    }

    if (resource === "ideas") {
      const parsed = createIdeaSchema.parse(body);
      const idea = await prisma.idea.create({
        data: {
          title: parsed.title,
          body: parsed.body,
          areaId: parsed.areaId,
          projectId: parsed.projectId,
          tags: parsed.tags ?? [],
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "idea_created", "Idea created", { type: "idea", id: idea.id });
      return { idea };
    }

    if (resource === "references") {
      const parsed = createReferenceSchema.parse(body);
      const reference = await prisma.reference.create({
        data: {
          body: parsed.body,
          url: parsed.url,
          tags: parsed.tags ?? [],
          areaId: parsed.areaId,
          projectId: parsed.projectId,
          relatedType: parsed.relatedType,
          relatedId: parsed.relatedId,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "reference_created", "Reference created", {
        type: "reference",
        id: reference.id,
      });
      return { reference };
    }

    if (resource === "entity-notes") {
      const parsed = createEntityNoteSchema.parse(body);
      const note = await prisma.entityNote.create({
        data: {
          parentType: parsed.parentType,
          parentId: parsed.parentId,
          bodyMd: parsed.bodyMd,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "entity_note_created", "Note added", {
        type: "entity_note",
        id: note.id,
        parentType: note.parentType,
        parentId: note.parentId,
      });
      return { note };
    }

    if (resource === "entity-docs") {
      const parsed = createEntityDocSchema.parse(body);
      const doc = await prisma.entityDoc.create({
        data: {
          parentType: parsed.parentType,
          parentId: parsed.parentId,
          title: parsed.title,
          bodyMd: parsed.bodyMd,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "entity_doc_created", "Doc created", {
        type: "entity_doc",
        id: doc.id,
        parentType: doc.parentType,
        parentId: doc.parentId,
      });
      return { doc };
    }

    if (resource === "milestones") {
      const parsed = createMilestoneSchema.parse(body);
      const milestone = await prisma.milestone.create({
        data: {
          projectId: parsed.projectId,
          title: parsed.title,
          sortOrder: parsed.sortOrder ?? 0,
        },
      });
      await auditApiWrite(apiKey, "milestone_created", "Milestone created", {
        type: "milestone",
        id: milestone.id,
        projectId: milestone.projectId,
      });
      return { milestone };
    }

    if (resource === "domains") {
      const parsed = createDomainSchema.parse(body);
      const domain = await prisma.domain.create({
        data: {
          name: parsed.name,
          description: parsed.description,
          sortOrder: parsed.sortOrder,
          active: parsed.active ?? true,
        },
      });
      await auditApiWrite(apiKey, "domain_created", "Domain created", {
        type: "domain",
        id: domain.id,
      });
      return { domain };
    }

    if (resource === "calendar-events") {
      const parsed = createCalendarEventSchema.parse(body);
      const event = await prisma.calendarEvent.create({
        data: {
          title: parsed.title,
          start: new Date(parsed.start),
          end: new Date(parsed.end),
          location: parsed.location,
          source: "api",
        },
      });
      await auditApiWrite(apiKey, "calendar_event_created", "Calendar event created", {
        type: "calendar_event",
        id: event.id,
      });
      return { event };
    }

    return notFound();
  });
}

export async function PATCH(request: Request, context: RouteCtx) {
  return handleApi(request, context, "write", async ({ apiKey, path }) => {
    const [resource, id] = path;
    if (!id) return notFound();
    const body = await readJson(request);

    if (resource === "tasks") {
      const parsed = patchTaskSchema.parse(body);
      const project = parsed.projectId
        ? await prisma.project.findUnique({
            where: { id: parsed.projectId },
            select: { areaId: true },
          })
        : null;
      const task = await prisma.task.update({
        where: { id },
        data: {
          title: parsed.title,
          notes: parsed.notes,
          status: parsed.status,
          dueDate: parseDateOnly(parsed.dueDate),
          dueTime: parsed.dueTime,
          priority: parsed.priority,
          areaId:
            project?.areaId ??
            (parsed.areaName ? await resolveAreaId(parsed.areaId, parsed.areaName) : parsed.areaId),
          projectId: parsed.projectId,
          parentTaskId: parsed.parentTaskId,
          someday: parsed.someday,
          recurrenceRule: parsed.recurrenceRule,
          reminderOffsets: parsed.reminderOffsets as Prisma.InputJsonValue,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "task_updated", "Task updated", { type: "task", id });
      return { task };
    }

    if (resource === "projects") {
      const parsed = patchProjectSchema.parse(body);
      const now = new Date();
      const areaId = parsed.areaName
        ? await resolveAreaId(parsed.areaId, parsed.areaName)
        : parsed.areaId;
      const project = await prisma.project.update({
        where: { id },
        data: {
          name: parsed.name,
          areaId,
          status: parsed.status,
          currentState: parsed.currentState,
          nextStep: parsed.nextStep,
          targetDate: parseDateOnly(parsed.targetDate),
          parkedAt:
            parsed.status === "parked"
              ? now
              : parsed.status === "active" || parsed.status === "someday"
                ? null
                : undefined,
          completedAt: parsed.status === "completed" ? now : undefined,
          killedAt: parsed.status === "killed" ? now : undefined,
        },
      });
      await prisma.projectActivity.create({
        data: {
          projectId: id,
          entry: parsed.logEntry ?? `Project updated through API by ${apiKey.label}.`,
          source: `api:${apiKey.label}`,
          stateSnapshot: {
            status: project.status,
            current_state: project.currentState,
            next_step: project.nextStep,
          },
        },
      });
      await auditApiWrite(apiKey, "project_updated", "Project updated", { type: "project", id });
      return { project };
    }

    if (resource === "areas") {
      const parsed = patchAreaSchema.parse(body);
      const domainId = parsed.domainName
        ? await resolveDomainId(parsed.domainId, parsed.domainName)
        : parsed.domainId;
      const area = await prisma.area.update({
        where: { id },
        data: {
          name: parsed.name,
          domainId,
          status: parsed.status,
          currentState: parsed.currentState,
          nextStep: parsed.nextStep,
          tendingCadence: parsed.tendingCadence,
          sortOrder: parsed.sortOrder,
        },
      });
      await auditApiWrite(apiKey, "area_updated", "Area updated", { type: "area", id });
      return { area };
    }

    if (resource === "ideas") {
      const parsed = patchIdeaSchema.parse(body);
      const idea = await prisma.idea.update({
        where: { id },
        data: {
          title: parsed.title,
          body: parsed.body,
          areaId: parsed.areaId,
          projectId: parsed.projectId,
          tags: parsed.tags,
          status: parsed.status,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "idea_updated", "Idea updated", { type: "idea", id });
      return { idea };
    }

    if (resource === "references") {
      const parsed = patchReferenceSchema.parse(body);
      const reference = await prisma.reference.update({
        where: { id },
        data: {
          body: parsed.body,
          url: parsed.url,
          tags: parsed.tags,
          areaId: parsed.areaId,
          projectId: parsed.projectId,
          relatedType: parsed.relatedType,
          relatedId: parsed.relatedId,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "reference_updated", "Reference updated", {
        type: "reference",
        id,
      });
      return { reference };
    }

    if (resource === "domains") {
      const parsed = patchDomainSchema.parse(body);
      const domain = await prisma.domain.update({
        where: { id },
        data: parsed,
      });
      await auditApiWrite(apiKey, "domain_updated", "Domain updated", {
        type: "domain",
        id,
      });
      return { domain };
    }

    if (resource === "entity-docs") {
      const parsed = patchEntityDocSchema.parse(body);
      const doc = await prisma.entityDoc.update({
        where: { id },
        data: {
          title: parsed.title,
          bodyMd: parsed.bodyMd,
          status: parsed.status,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "entity_doc_updated", "Doc updated", {
        type: "entity_doc",
        id,
      });
      return { doc };
    }

    if (resource === "milestones") {
      const parsed = patchMilestoneSchema.parse(body);
      const milestone = await prisma.milestone.update({
        where: { id },
        data: {
          title: parsed.title,
          status: parsed.status,
          sortOrder: parsed.sortOrder,
          completedAt: parsed.status === "completed" ? new Date() : undefined,
        },
      });
      await auditApiWrite(apiKey, "milestone_updated", "Milestone updated", {
        type: "milestone",
        id,
      });
      return { milestone };
    }

    if (resource === "calendar-events") {
      const parsed = patchCalendarEventSchema.parse(body);
      const event = await prisma.calendarEvent.update({
        where: { id },
        data: {
          title: parsed.title,
          start: parsed.start ? new Date(parsed.start) : undefined,
          end: parsed.end ? new Date(parsed.end) : undefined,
          location: parsed.location,
          status: parsed.status,
          source: "api",
          lastPushedAt: null,
        },
      });
      await auditApiWrite(apiKey, "calendar_event_updated", "Calendar event updated", {
        type: "calendar_event",
        id,
      });
      return { event };
    }

    return notFound();
  });
}

async function handleApi(
  request: Request,
  context: RouteCtx,
  scope: "read" | "write" | "capture",
  fn: (args: {
    apiKey: AuthenticatedApiKey;
    path: string[];
    url: URL;
  }) => Promise<unknown>,
) {
  try {
    const apiKey = await authenticateApiRequest(request, scope);
    const params = await context.params;
    const path = params.path ?? [];
    const url = new URL(request.url);
    const result = await fn({ apiKey, path, url });
    if (result instanceof Response) return result;
    return Response.json(result);
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return Response.json({ error: z.treeifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "API request failed." },
      { status: 500 },
    );
  }
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return {};
  }
}

function notFound() {
  return Response.json({ error: "Not found." }, { status: 404 });
}

async function resolveDomainId(domainId?: string, domainName?: string) {
  if (domainId) return domainId;
  if (domainName) {
    const domain = await prisma.domain.findFirst({
      where: { name: { equals: domainName, mode: "insensitive" } },
    });
    if (domain) return domain.id;
  }
  const system = await prisma.domain.findUnique({ where: { name: "System" } });
  if (system) return system.id;
  const fallback = await prisma.domain.findFirst({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (!fallback) throw new Error("No active domain is available.");
  return fallback.id;
}

async function resolveAreaId(areaId?: string, areaName?: string) {
  if (areaId) return areaId;
  if (areaName) {
    const area = await prisma.area.findFirst({
      where: { name: { equals: areaName, mode: "insensitive" } },
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    if (area) return area.id;
  }
  return getInboxAreaId();
}

async function getInboxAreaId() {
  const inbox = await prisma.area.findUnique({ where: { id: "area_inbox" } });
  if (!inbox) throw new Error("Inbox area is missing.");
  return inbox.id;
}

function parseDateOnly(value?: string | null) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

async function auditApiWrite(
  apiKey: AuthenticatedApiKey,
  type: string,
  title: string,
  sourceRef: Record<string, unknown>,
) {
  await prisma.notification.create({
    data: {
      type,
      title,
      sourceRef: {
        ...sourceRef,
        source: "api",
        actor: apiKey.label,
      },
    },
  });
}

async function runSearch(query: string) {
  if (!query) {
    return { results: [] };
  }

  const [
    captures,
    areas,
    projects,
    tasks,
    ideas,
    references,
    projectActivity,
    entityNotes,
    entityDocs,
    milestones,
  ] = await Promise.all([
      prisma.$queryRaw`
        SELECT 'capture' AS type, id, raw_text AS title, created_at
        FROM captures
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(raw_text, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw`
        SELECT 'area' AS type, id, name AS title, created_at
        FROM areas
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(name, '') || ' ' || COALESCE(current_state, '') || ' ' || COALESCE(next_step, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw`
        SELECT 'project' AS type, id, name AS title, created_at
        FROM projects
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(name, '') || ' ' || COALESCE(current_state, '') || ' ' || COALESCE(next_step, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw`
        SELECT 'task' AS type, id, title, created_at
        FROM tasks
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(title, '') || ' ' || COALESCE(notes, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw`
        SELECT 'idea' AS type, id, title, created_at
        FROM ideas
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(title, '') || ' ' || COALESCE(body, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw`
        SELECT 'reference' AS type, id, body AS title, created_at
        FROM "references"
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(body, '') || ' ' || COALESCE(url, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw`
        SELECT 'project_activity' AS type, id, entry AS title, created_at
        FROM project_activity
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(entry, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw`
        SELECT 'entity_note' AS type, id, body_md AS title, created_at
        FROM entity_notes
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(body_md, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw`
        SELECT 'entity_doc' AS type, id, title, created_at
        FROM entity_docs
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(title, '') || ' ' || COALESCE(body_md, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw`
        SELECT 'milestone' AS type, id, title, completed_at AS created_at
        FROM milestones
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(title, ''))
          @@ websearch_to_tsquery('pg_catalog.english'::regconfig, ${query})
        ORDER BY completed_at DESC NULLS LAST
        LIMIT 20
      `,
    ]);

  return {
    results: [
      ...(captures as unknown[]),
      ...(areas as unknown[]),
      ...(projects as unknown[]),
      ...(tasks as unknown[]),
      ...(ideas as unknown[]),
      ...(references as unknown[]),
      ...(projectActivity as unknown[]),
      ...(entityNotes as unknown[]),
      ...(entityDocs as unknown[]),
      ...(milestones as unknown[]),
    ].slice(0, 50),
  };
}

const createTaskSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  priority: z.string().optional(),
  areaId: z.string().optional(),
  areaName: z.string().optional(),
  projectId: z.string().optional(),
  parentTaskId: z.string().optional(),
  someday: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
  reminderOffsets: z.array(z.union([z.string(), z.number()])).optional(),
});

const apiCaptureSchema = z.object({
  rawText: z.string().min(1),
  deviceContext: z.record(z.string(), z.unknown()).optional(),
});

const patchTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["open", "completed", "killed"]).optional(),
});

const createProjectSchema = z.object({
  name: z.string().min(1),
  areaId: z.string().optional(),
  areaName: z.string().optional(),
  status: z.enum(["someday", "active", "parked", "completed", "killed"]).optional(),
  currentState: z.string().optional(),
  nextStep: z.string().optional(),
  targetDate: z.string().optional(),
});

const patchProjectSchema = createProjectSchema.partial().extend({
  logEntry: z.string().optional(),
});

const createAreaSchema = z.object({
  name: z.string().min(1),
  domainId: z.string().optional(),
  domainName: z.string().optional(),
  status: z.enum(["active", "parked", "retired"]).optional(),
  currentState: z.string().optional(),
  nextStep: z.string().optional(),
  tendingCadence: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const patchAreaSchema = createAreaSchema.partial();

const createIdeaSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  areaId: z.string().optional(),
  projectId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const patchIdeaSchema = createIdeaSchema.partial().extend({
  status: z.enum(["seed", "developing", "converted", "killed"]).optional(),
});

const createReferenceSchema = z.object({
  body: z.string().min(1),
  url: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  areaId: z.string().optional(),
  projectId: z.string().optional(),
  relatedType: z.string().optional(),
  relatedId: z.string().optional(),
});

const patchReferenceSchema = createReferenceSchema.partial();

const createDomainSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

const patchDomainSchema = createDomainSchema.partial();

const createEntityNoteSchema = z.object({
  parentType: z.enum(["area", "project"]),
  parentId: z.string().min(1),
  bodyMd: z.string().min(1),
});

const createEntityDocSchema = z.object({
  parentType: z.enum(["area", "project"]),
  parentId: z.string().min(1),
  title: z.string().min(1),
  bodyMd: z.string().default(""),
});

const patchEntityDocSchema = createEntityDocSchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
});

const createMilestoneSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

const patchMilestoneSchema = createMilestoneSchema.partial().extend({
  status: z.enum(["open", "completed"]).optional(),
});

const createCalendarEventSchema = z.object({
  title: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
  location: z.string().optional(),
});

const patchCalendarEventSchema = createCalendarEventSchema.partial().extend({
  status: z.string().optional(),
});
