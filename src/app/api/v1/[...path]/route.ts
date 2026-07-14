import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  ApiAuthError,
  authenticateApiRequest,
  type AuthenticatedApiKey,
} from "@/lib/api/auth";
import { submitCapture } from "@/lib/capture/service";
import { createCheckInRecord, draftCheckInFromActivity } from "@/lib/checkins";
import { localDateString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getAreaAggregate } from "@/lib/areas";
import {
  normalizeParentDestination,
  resolveVerifiedDestination,
} from "@/lib/destinations";
import { createPersonRecord } from "@/lib/people";
import {
  flattenAreaOptions,
} from "@/lib/hierarchy";
import {
  createAreaForApi,
  createProjectForApi,
  listAreasForApi,
  patchAreaForApi,
  patchProjectForApi,
  toApiErrorResponse,
} from "@/lib/api/hierarchy";
import {
  boostResurfaceWeight,
  getDailyResurfacedItem,
} from "@/lib/resurfacing";
import { completeRoutineById, getRoutinesWithState } from "@/lib/routines";
import { getTodayDashboard } from "@/lib/today";
import { completeTaskById, createTaskWithAudit } from "@/lib/tasks";
import {
  dispatchReadLaterRoute,
  readLaterRouteScope,
} from "@/lib/api/read-later-router";
import { toReferenceSearchResult, type SearchableReference } from "@/lib/reference-search-result";
import { updateEntityNoteForApi } from "@/lib/api/entity-note";
import { convertIdeaForApi } from "@/lib/api/idea-conversion";
import { updateMilestoneForApi } from "@/lib/api/milestone";

type RouteCtx = {
  params: Promise<{ path?: string[] }>;
};

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  q: z.string().optional(),
});

export async function GET(request: Request, context: RouteCtx) {
  const path = (await context.params).path ?? [];
  const scope = readLaterRouteScope("GET", path) ?? "read";
  return handleApi(request, context, scope, async ({ apiKey, path, url }) => {
    const readLater = await dispatchReadLaterRoute({
      method: "GET", path, url, body: undefined, actor: apiKey,
    });
    if (readLater) return readLater;
    const [resource, id, action] = path;

    if (resource === "today") {
      return getTodayDashboard();
    }

    if (resource === "search") {
      const query = url.searchParams.get("q")?.trim() ?? "";
      return runSearch(query);
    }

    if (resource === "areas") {
      if (id && action === "aggregate") {
        return { aggregate: await getAreaAggregate(id) };
      }
      if (id) {
        const [area, paths] = await Promise.all([
          prisma.area.findUnique({
            where: { id },
            include: {
              tasks: {
                where: { status: "open" },
                orderBy: { createdAt: "desc" },
              },
              projects: { orderBy: { createdAt: "desc" } },
              ideas: { orderBy: { updatedAt: "desc" } },
            },
          }),
          getAreaPathMap(),
        ]);
        return {
          area: area ? { ...area, path: paths.get(area.id) ?? area.name } : null,
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

      return { areas: await listAreasForApi() };
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
      const starredParam = url.searchParams.get("starred");
      const viewParam = url.searchParams.get("view");
      return {
        tasks: await listTasksForApi({
          ...query,
          starred: starredParam === "1" || starredParam === "true",
          view: viewParam === "open" || viewParam === "done" ? viewParam : undefined,
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
              milestones: {
                orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
              },
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
      if (id) {
        return { note: await prisma.entityNote.findUnique({ where: { id } }) };
      }
      return {
        notes: await prisma.entityNote.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      };
    }

    if (resource === "entity-docs") {
      if (id) {
        return { doc: await prisma.entityDoc.findUnique({ where: { id } }) };
      }
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

    if (resource === "check-ins") {
      const parentType = url.searchParams.get("parentType");
      const parentId = url.searchParams.get("parentId");
      return {
        checkIns: await prisma.checkIn.findMany({
          where: {
            ...(parentType === "area" || parentType === "project"
              ? { parentType }
              : {}),
            ...(parentId ? { parentId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      };
    }

    if (resource === "journal-entries") {
      const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));
      return {
        journalEntries: await prisma.journalEntry.findMany({
          where: query.q
            ? { bodyMd: { contains: query.q, mode: "insensitive" } }
            : undefined,
          orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
          take: query.limit,
          ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        }),
      };
    }

    if (resource === "resurfacing") {
      return { item: await getDailyResurfacedItem() };
    }

    if (resource === "scheduled-reviews") {
      const status = url.searchParams.get("status");
      return {
        reviews: await prisma.scheduledReview.findMany({
          where:
            status === "pending" ||
            status === "surfaced" ||
            status === "done" ||
            status === "dismissed"
              ? { status }
              : undefined,
          include: { capture: { select: { rawText: true } } },
          orderBy: [{ reviewAt: "asc" }, { createdAt: "asc" }],
          take: 100,
        }),
      };
    }

    if (resource === "routines") {
      if (id && action === "completions") {
        return {
          completions: await prisma.routineCompletion.findMany({
            where: { routineId: id },
            orderBy: { completedAt: "desc" },
            take: 100,
          }),
        };
      }
      return { routines: await getRoutinesWithState() };
    }

    if (resource === "people") {
      if (id) {
        return {
          person: await prisma.person.findUnique({
            where: { id },
            include: {
              facts: { orderBy: { createdAt: "desc" }, take: 100 },
              interactions: { orderBy: { occurredAt: "desc" }, take: 100 },
            },
          }),
        };
      }
      const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));
      return {
        people: await prisma.person.findMany({
          where: query.q
            ? { name: { contains: query.q, mode: "insensitive" } }
            : undefined,
          orderBy: { name: "asc" },
          take: query.limit,
        }),
      };
    }

    return notFound();
  });
}

type TaskListQuery = {
  limit: number;
  cursor?: string;
  q?: string;
  starred?: boolean;
  view?: "open" | "done";
};

type TaskListClient = Pick<Prisma.TransactionClient, "task">;

export async function listTasksForApi(
  query: TaskListQuery,
  client: TaskListClient = prisma,
) {
  const where: Prisma.TaskWhereInput = {
    ...(query.q
      ? { title: { contains: query.q, mode: "insensitive" } }
      : {}),
    ...(query.starred ? { starred: true } : {}),
    ...(query.view === "open"
      ? { status: "open" }
      : query.view === "done"
        ? { status: "completed" }
        : {}),
  };

  if (query.cursor) {
    const cursor = await client.task.findFirst({
      where: { ...where, id: query.cursor },
      select: { id: true },
    });
    if (!cursor) throw new Error("Task pagination cursor not found.");
  }

  const tasks = await client.task.findMany({
    where,
    include: { area: true, project: true, subtasks: true },
    orderBy: [
      { status: "asc" },
      { dueDate: "asc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: query.limit,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  if (query.cursor && tasks.some((task) => task.id === query.cursor)) {
    throw new Error("Task pagination cursor repeated.");
  }
  return tasks;
}

export async function POST(request: Request, context: RouteCtx) {
  const path = (await context.params).path ?? [];
  const requiredScope = readLaterRouteScope("POST", path) ??
    (path[0] === "captures" ? "capture" : "write");
  return handleApi(
    request,
    context,
    requiredScope,
    async ({ apiKey, path }) => {
      const [resource, id, action] = path;
      const body = await readJson(request);
      const readLater = await dispatchReadLaterRoute({
        method: "POST", path, url: new URL(request.url), body, actor: apiKey,
      });
      if (readLater) return readLater;

      if (resource === "captures") {
        const parsed = apiCaptureSchema.parse(body);
        return submitCapture({
          rawText: parsed.rawText,
          source: "api",
          captureIntent: parsed.captureIntent ?? "auto",
          idempotencyKey: parsed.idempotencyKey,
          deviceContext: parsed.deviceContext,
        }, { apiKeyLabel: apiKey.label });
      }

      if (resource === "tasks" && id && action === "star") {
        const parsed = z
          .object({ starred: z.boolean().default(true) })
          .parse(body ?? {});
        const task = await prisma.task.update({
          where: { id },
          data: { starred: parsed.starred },
        });
        await auditApiWrite(
          apiKey,
          parsed.starred ? "task_starred" : "task_unstarred",
          parsed.starred ? "Task starred" : "Task unstarred",
          { type: "task", id: task.id },
        );
        return { task };
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
        if (parsed.projectId && !project) throw new Error("Project not found.");
        const requestedAreaId = await resolveAreaReference(
          parsed.areaId,
          parsed.areaName,
        );
        const areaId = project?.areaId ?? requestedAreaId;
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
        const area = await createAreaForApi(parsed, apiKey);
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
        await auditApiWrite(
          apiKey,
          "project_activity_created",
          "Project activity logged",
          {
            type: "project_activity",
            id: activity.id,
            projectId: id,
          },
        );
        return { activity };
      }

      if (resource === "projects") {
        const parsed = createProjectSchema.parse(body);
        const project = await createProjectForApi(parsed, apiKey);
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
        const parsed = z
          .object({
            to: z.enum(["task", "project"]),
            title: z.string().optional(),
            areaId: z.string().optional(),
          })
          .parse(body);
        const converted = await convertIdeaForApi(id, parsed, apiKey);
        if (!converted) return notFound();
        return converted.type === "task"
          ? { task: converted.value }
          : { project: converted.value };
      }

      if (resource === "ideas") {
        const parsed = createIdeaSchema.parse(body);
        const destination = await resolveApiDestination(parsed);
        const idea = await prisma.idea.create({
          data: {
            title: parsed.title,
            body: parsed.body,
            areaId: destination.areaId,
            projectId: destination.projectId,
            tags: parsed.tags ?? [],
            source: `api:${apiKey.label}`,
          },
        });
        await auditApiWrite(apiKey, "idea_created", "Idea created", {
          type: "idea",
          id: idea.id,
        });
        return { idea };
      }

      if (resource === "references" && !id) {
        const parsed = createReferenceSchema.parse(body);
        const destination = await resolveApiDestination(parsed);
        const reference = await prisma.reference.create({
          data: {
            body: parsed.body,
            url: parsed.url,
            tags: parsed.tags ?? [],
            areaId: destination.areaId,
            projectId: destination.projectId,
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
        const parent = await resolveApiParent(parsed);
        const note = await prisma.entityNote.create({
          data: {
            parentType: parent.parentType,
            parentId: parent.parentId,
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
        const parent = await resolveApiParent(parsed);
        const doc = await prisma.entityDoc.create({
          data: {
            parentType: parent.parentType,
            parentId: parent.parentId,
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
        await auditApiWrite(
          apiKey,
          "calendar_event_created",
          "Calendar event created",
          {
            type: "calendar_event",
            id: event.id,
          },
        );
        return { event };
      }

      if (resource === "check-ins" && id === "draft") {
        const parsed = z
          .object({
            parentType: z.enum(["area", "project"]),
            parentId: z.string().min(1),
          })
          .parse(body);
        return draftCheckInFromActivity(parsed.parentType, parsed.parentId);
      }

      if (resource === "check-ins") {
        const parsed = z
          .object({
            parentType: z.enum(["area", "project"]),
            parentId: z.string().min(1),
            bodyMd: z.string().min(1),
          })
          .parse(body);
        const { checkIn } = await createCheckInRecord(
          {
            parentType: parsed.parentType,
            parentId: parsed.parentId,
            bodyMd: parsed.bodyMd,
          },
          { source: "api", label: apiKey.label },
        );
        return { checkIn };
      }

      if (resource === "journal-entries") {
        const parsed = z
          .object({
            bodyMd: z.string().min(1),
            entryDate: z.string().optional(),
            tags: z.array(z.string()).optional(),
            source: z.enum(["typed", "import"]).optional(),
          })
          .parse(body);
        const entry = await prisma.journalEntry.create({
          data: {
            bodyMd: parsed.bodyMd,
            entryDate:
              parseDateOnly(parsed.entryDate) ??
              new Date(`${localDateString()}T00:00:00.000Z`),
            tags: parsed.tags ?? [],
            source: parsed.source ?? "import",
          },
        });
        await auditApiWrite(
          apiKey,
          "journal_entry_created",
          "Journal entry saved",
          {
            type: "journal_entry",
            id: entry.id,
          },
        );
        return { journalEntry: entry };
      }

      if (
        resource === "resurfacing" &&
        id &&
        (action === "boost" || action === "dismiss")
      ) {
        const seen = await prisma.resurfacingSeen.findUnique({ where: { id } });
        if (!seen || seen.response !== null) {
          return { updated: false };
        }
        if (action === "boost") {
          await boostResurfaceWeight(seen.itemType, seen.itemId);
        }
        await prisma.resurfacingSeen.update({
          where: { id },
          data: { response: action === "boost" ? "kept" : "dismissed" },
        });
        await auditApiWrite(
          apiKey,
          action === "boost" ? "resurface_boosted" : "resurface_dismissed",
          action === "boost"
            ? "Resurfaced memory boosted"
            : "Resurfaced memory dismissed",
          { type: seen.itemType, id: seen.itemId },
        );
        return { updated: true };
      }

      if (resource === "scheduled-reviews" && id && action) {
        const review = await prisma.scheduledReview.findUnique({
          where: { id },
          include: { capture: { select: { rawText: true } } },
        });
        if (
          !review ||
          review.status === "done" ||
          review.status === "dismissed"
        ) {
          return { updated: false };
        }

        if (action === "done" || action === "dismiss") {
          const status =
            action === "done" ? ("done" as const) : ("dismissed" as const);
          await prisma.scheduledReview.update({
            where: { id },
            data: { status },
          });
          await auditApiWrite(
            apiKey,
            status === "done" ? "review_done" : "review_dismissed",
            status === "done" ? "Review done" : "Review dismissed",
            { type: "scheduled_review", id: review.id },
          );
          return { updated: true };
        }

        if (action === "snooze") {
          const parsed = z
            .object({ reviewAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
            .parse(body);
          await prisma.scheduledReview.update({
            where: { id },
            data: {
              status: "pending",
              reviewAt: parseDateOnly(parsed.reviewAt),
            },
          });
          await auditApiWrite(
            apiKey,
            "review_snoozed",
            `Review snoozed to ${parsed.reviewAt}`,
            {
              type: "scheduled_review",
              id: review.id,
            },
          );
          return { updated: true };
        }
      }

      if (resource === "routines" && id && action === "complete") {
        const result = await completeRoutineById(id, {
          source: "api",
          label: apiKey.label,
        });
        return { routine: result.routine, repeated: result.repeated };
      }

      if (resource === "routines") {
        const parsed = z
          .object({
            name: z.string().min(1),
            description: z.string().optional(),
            areaId: z.string().optional(),
            frequency: z.enum(["daily", "weekly", "custom"]).optional(),
            days: z.array(z.string()).optional(),
            timeWindow: z
              .enum(["morning", "afternoon", "evening", "anytime"])
              .optional(),
            timesPerWeek: z.number().optional(),
            graceDays: z.number().optional(),
            temporary: z.boolean().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
          })
          .parse(body);
        const routine = await prisma.routine.create({
          data: {
            name: parsed.name,
            description: parsed.description,
            areaId: parsed.areaId,
            schedule: {
              frequency:
                parsed.frequency ??
                (parsed.days && parsed.days.length > 0 ? "custom" : "daily"),
              days: parsed.days ?? [],
              timeWindow: parsed.timeWindow ?? "anytime",
            },
            goal:
              typeof parsed.timesPerWeek === "number"
                ? { timesPerWeek: parsed.timesPerWeek }
                : undefined,
            graceWindow:
              typeof parsed.graceDays === "number"
                ? { days: parsed.graceDays }
                : undefined,
            temporary: parsed.temporary ?? false,
            startDate: parseDateOnly(parsed.startDate),
            endDate: parseDateOnly(parsed.endDate),
          },
        });
        await auditApiWrite(apiKey, "routine_created", "Routine created", {
          type: "routine",
          id: routine.id,
        });
        return { routine };
      }

      if (resource === "people" && id && action === "facts") {
        const parsed = z
          .object({
            factType: z.string().optional(),
            factValue: z.string().min(1),
            dateRelevant: z.string().optional(),
            recurring: z.boolean().optional(),
          })
          .parse(body);
        const fact = await prisma.personFact.create({
          data: {
            personId: id,
            factType: parsed.factType ?? "note",
            factValue: parsed.factValue,
            dateRelevant: parseDateOnly(parsed.dateRelevant),
            recurring: parsed.recurring ?? false,
          },
        });
        await auditApiWrite(apiKey, "person_fact_created", "Fact saved", {
          type: "person_fact",
          id: fact.id,
          personId: id,
        });
        return { fact };
      }

      if (resource === "people" && id && action === "interactions") {
        const parsed = z
          .object({
            interactionType: z.string().optional(),
            notes: z.string().optional(),
            occurredAt: z.string().optional(),
          })
          .parse(body);
        const interaction = await prisma.personInteraction.create({
          data: {
            personId: id,
            interactionType: parsed.interactionType ?? "touchpoint",
            notesMd: parsed.notes,
            occurredAt: parsed.occurredAt
              ? new Date(parsed.occurredAt)
              : new Date(),
            source: "manual",
          },
        });
        await auditApiWrite(
          apiKey,
          "interaction_logged",
          "Interaction logged",
          {
            type: "person_interaction",
            id: interaction.id,
            personId: id,
          },
        );
        return { interaction };
      }

      if (resource === "people") {
        const parsed = z
          .object({
            name: z.string().min(1),
            relationshipType: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            company: z.string().optional(),
            areaId: z.string().optional(),
          })
          .parse(body);
        const person = await createPersonRecord(parsed, {
          source: "api",
          label: apiKey.label,
        });
        return { person };
      }

      return notFound();
    },
  );
}

export async function PATCH(request: Request, context: RouteCtx) {
  const path = (await context.params).path ?? [];
  const scope = readLaterRouteScope("PATCH", path) ?? "write";
  return handleApi(request, context, scope, async ({ apiKey, path }) => {
    const body = await readJson(request);
    const readLater = await dispatchReadLaterRoute({
      method: "PATCH", path, url: new URL(request.url), body, actor: apiKey,
    });
    if (readLater) return readLater;
    const [resource, id] = path;
    if (!id) return notFound();

    if (resource === "tasks") {
      const parsed = patchTaskSchema.parse(body);
      const current = await prisma.task.findUnique({
        where: { id },
        select: { areaId: true, projectId: true },
      });
      if (!current) return notFound();
      const nextProjectId = parsed.projectId === undefined ? current.projectId : parsed.projectId;
      const project = nextProjectId
        ? await prisma.project.findUnique({
            where: { id: nextProjectId },
            select: { areaId: true },
          })
        : null;
      const requestedAreaId = parsed.areaName
        ? await resolveAreaReference(parsed.areaId ?? undefined, parsed.areaName)
        : parsed.areaId === undefined ? current.areaId : parsed.areaId;
      const destination = await resolveVerifiedDestination({
        areaId: project?.areaId ?? requestedAreaId,
        projectId: nextProjectId,
      });
      const task = await prisma.task.update({
        where: { id },
        data: {
          title: parsed.title,
          notes: parsed.notes,
          status: parsed.status,
          dueDate: parseDateOnly(parsed.dueDate),
          dueTime: parsed.dueTime,
          priority: parsed.priority,
          areaId: destination.areaId,
          projectId: destination.projectId,
          parentTaskId: parsed.parentTaskId,
          someday: parsed.someday,
          recurrenceRule: parsed.recurrenceRule,
          reminderOffsets: parsed.reminderOffsets as Prisma.InputJsonValue,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "task_updated", "Task updated", {
        type: "task",
        id,
      });
      return { task };
    }

    if (resource === "projects") {
      const parsed = patchProjectSchema.parse(body);
      const project = await patchProjectForApi(id, parsed, apiKey);
      return { project };
    }

    if (resource === "areas") {
      const parsed = patchAreaSchema.parse(body);
      const area = await patchAreaForApi(id, parsed, apiKey);
      return { area };
    }

    if (resource === "ideas") {
      const parsed = patchIdeaSchema.parse(body);
      const existing = await prisma.idea.findUnique({ where: { id }, select: { areaId: true, projectId: true } });
      if (!existing) return notFound();
      const destination = await resolveApiDestination({
        areaId: parsed.areaId === undefined ? existing.areaId : parsed.areaId,
        projectId: parsed.projectId === undefined ? existing.projectId : parsed.projectId,
      });
      const idea = await prisma.idea.update({
        where: { id },
        data: {
          title: parsed.title,
          body: parsed.body,
          areaId: destination.areaId,
          projectId: destination.projectId,
          tags: parsed.tags,
          status: parsed.status,
          source: `api:${apiKey.label}`,
        },
      });
      await auditApiWrite(apiKey, "idea_updated", "Idea updated", {
        type: "idea",
        id,
      });
      return { idea };
    }

    if (resource === "references") {
      const parsed = patchReferenceSchema.parse(body);
      const existing = await prisma.reference.findUnique({ where: { id }, select: { areaId: true, projectId: true } });
      if (!existing) return notFound();
      const destination = await resolveApiDestination({
        areaId: parsed.areaId === undefined ? existing.areaId : parsed.areaId,
        projectId: parsed.projectId === undefined ? existing.projectId : parsed.projectId,
      });
      const reference = await prisma.reference.update({
        where: { id },
        data: {
          body: parsed.body,
          url: parsed.url,
          tags: parsed.tags,
          areaId: destination.areaId,
          projectId: destination.projectId,
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

    if (resource === "entity-notes") {
      const parsed = patchEntityNoteSchema.parse(body);
      return { note: await updateEntityNoteForApi(id, parsed, apiKey) };
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
      return { milestone: await updateMilestoneForApi(id, parsed, apiKey) };
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
      await auditApiWrite(
        apiKey,
        "calendar_event_updated",
        "Calendar event updated",
        {
          type: "calendar_event",
          id,
        },
      );
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
  let path: string[] = [];
  try {
    const apiKey = await authenticateApiRequest(request, scope);
    const params = await context.params;
    path = params.path ?? [];
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

    return toApiErrorResponse(error);
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

async function getAreaPathMap() {
  const areas = await prisma.area.findMany({
    select: {
      id: true,
      name: true,
      parentAreaId: true,
      sortOrder: true,
    },
  });
  return new Map(flattenAreaOptions(areas).map((area) => [area.id, area.path]));
}

async function resolveAreaReference(
  areaId?: string | null,
  areaName?: string,
) {
  if (areaName) {
    const area = await prisma.area.findFirst({
      where: { name: { equals: areaName, mode: "insensitive" } },
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    if (!area) throw new Error("Area not found.");
    if (areaId && area.id !== areaId) {
      throw new Error("Conflicting Area fields.");
    }
    return area.id;
  }
  return areaId ?? null;
}

async function resolveApiDestination(input: {
  areaId?: string | null;
  projectId?: string | null;
}) {
  if (input.projectId && !input.areaId) {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { areaId: true },
    });
    if (!project) throw new Error("Project not found.");
    return resolveVerifiedDestination({ areaId: project.areaId, projectId: input.projectId });
  }
  return resolveVerifiedDestination(input);
}

async function resolveApiParent(input: {
  parentType?: "area" | "project" | null;
  parentId?: string | null;
  areaId?: string | null;
  projectId?: string | null;
}) {
  const { areaId, projectId } = normalizeParentDestination(input);
  const destination = await resolveApiDestination({ areaId, projectId });
  return destination.projectId
    ? { parentType: "project" as const, parentId: destination.projectId }
    : destination.areaId
      ? { parentType: "area" as const, parentId: destination.areaId }
      : { parentType: null, parentId: null };
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
        SELECT id, kind, title, body, url, read_status AS "readStatus"
        FROM "references"
        WHERE to_tsvector('pg_catalog.english'::regconfig, COALESCE(title, '') || ' ' || COALESCE(body, '') || ' ' || COALESCE(url, ''))
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
      ...(references as SearchableReference[]).map(toReferenceSearchResult),
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
  areaId: z.string().nullable().optional(),
  areaName: z.string().optional(),
  projectId: z.string().nullable().optional(),
  parentTaskId: z.string().optional(),
  someday: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
  reminderOffsets: z.array(z.union([z.string(), z.number()])).optional(),
});

const apiCaptureSchema = z.object({
  rawText: z.string().min(1),
  captureIntent: z.literal("preserve_only").optional(),
  idempotencyKey: z.string().uuid().optional(),
  deviceContext: z.record(z.string(), z.unknown()).optional(),
});

const patchTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["open", "completed", "killed"]).optional(),
});

const createProjectSchema = z.object({
  name: z.string().min(1),
  areaId: z.string().trim().min(1).nullable().optional(),
  areaName: z.string().trim().min(1).optional(),
  status: z
    .enum(["someday", "active", "parked", "completed", "killed"])
    .optional(),
  currentState: z.string().optional(),
  nextStep: z.string().optional(),
  targetDate: z.string().optional(),
});

const patchProjectSchema = createProjectSchema.partial().extend({
  logEntry: z.string().optional(),
});

const createAreaSchema = z.object({
  name: z.string().min(1),
  parentAreaId: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().min(1).nullable().optional(),
  ),
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
  areaId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const patchIdeaSchema = createIdeaSchema.partial().extend({
  status: z.enum(["seed", "developing", "converted", "killed"]).optional(),
});

const createReferenceSchema = z.object({
  body: z.string().min(1),
  url: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  areaId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  relatedType: z.string().optional(),
  relatedId: z.string().optional(),
});

const patchReferenceSchema = createReferenceSchema.partial();

const createEntityNoteSchema = z.object({
  parentType: z.enum(["area", "project"]).nullable().optional(),
  parentId: z.string().nullable().optional(),
  areaId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  bodyMd: z.string().min(1),
});

const patchEntityNoteSchema = z.object({ bodyMd: z.string().min(1) });

const createEntityDocSchema = z.object({
  parentType: z.enum(["area", "project"]).nullable().optional(),
  parentId: z.string().nullable().optional(),
  areaId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
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
