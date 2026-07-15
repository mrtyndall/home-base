import { prisma } from "@/lib/db";
import type { Capture, Task } from "@prisma/client";
import {
  addDaysToDateString,
  dateOnlyFromString,
  localDateString,
  zonedDayBounds,
} from "@/lib/dates";
import { getDailyResurfacedItem } from "@/lib/resurfacing";
import { getRoutinesWithState } from "@/lib/routines";
import { getTodayTaskInboxLimit } from "@/lib/today-task-inbox";
import { mergeUpcomingCommitments } from "@/lib/upcoming-commitments";
import { flattenAreaOptions } from "@/lib/hierarchy";

type UpcomingTaskCandidate = Pick<
  Task,
  "id" | "title" | "dueDate" | "dueTime"
>;

export async function getTodayDashboard() {
  const today = localDateString();
  const tomorrow = addDaysToDateString(today, 1);
  const dayAfterTomorrow = addDaysToDateString(today, 2);
  const todayDate = dateOnlyFromString(today);
  const tomorrowDate = dateOnlyFromString(tomorrow);
  const todayCalendarBounds = zonedDayBounds(today);
  const tomorrowCalendarBounds = zonedDayBounds(tomorrow);
  const dayAfterTomorrowCalendarBounds = zonedDayBounds(dayAfterTomorrow);

  if (!process.env.DATABASE_URL) {
    return {
      ready: false as const,
      today,
      tomorrow,
      reason: "DATABASE_URL is not configured.",
    };
  }

  try {
    const [
      topTasks,
      starredCount,
      dueToday,
      dueTomorrow,
      todayEvents,
      tomorrowEvents,
      taskInbox,
      recentCaptures,
      nextTask,
      nextEvent,
      calendarSync,
      calendarStaleMinutesSetting,
      areas,
      destinationProjects,
      upcomingTasks,
      upcomingEvents,
    ] = await Promise.all([
      prisma.task.findMany({
        where: { status: "open", starred: true },
        include: { area: true, project: true },
        orderBy: [
          { dueDate: { sort: "asc", nulls: "last" } },
          { dueTime: "asc" },
          { createdAt: "asc" },
        ],
        take: 3,
      }),
      prisma.task.count({ where: { status: "open", starred: true } }),
      prisma.task.findMany({
        where: {
          status: "open",
          someday: false,
          dueDate: { lte: todayDate },
        },
        include: { area: true, project: true },
        orderBy: [
          { dueDate: "asc" },
          { sortOrder: "asc" },
          { dueTime: "asc" },
          { createdAt: "asc" },
        ],
        take: 12,
      }),
      prisma.task.findMany({
        where: {
          status: "open",
          someday: false,
          dueDate: tomorrowDate,
        },
        include: { area: true, project: true },
        orderBy: [
          { sortOrder: "asc" },
          { dueTime: "asc" },
          { createdAt: "asc" },
        ],
        take: 8,
      }),
      prisma.calendarEvent.findMany({
        where: {
          start: {
            gte: todayCalendarBounds.start,
            lt: todayCalendarBounds.end,
          },
        },
        orderBy: { start: "asc" },
        take: 8,
      }),
      prisma.calendarEvent.findMany({
        where: {
          start: {
            gte: tomorrowCalendarBounds.start,
            lt: tomorrowCalendarBounds.end,
          },
        },
        orderBy: { start: "asc" },
        take: 6,
      }),
      prisma.task.findMany({
        where: {
          status: "open",
          someday: false,
          dueDate: null,
          parentTaskId: null,
        },
        include: { area: true, project: true },
        orderBy: [
          { sortOrder: "asc" },
          { updatedAt: "desc" },
          { createdAt: "desc" },
        ],
        take: getTodayTaskInboxLimit(),
      }),
      prisma.$queryRaw<Capture[]>`
        SELECT
          id,
          raw_text AS "rawText",
          source,
          status,
          device_context AS "deviceContext",
          parse_status AS "parseStatus",
          parsed_actions AS "parsedActions",
          created_items AS "createdItems",
          created_at AS "createdAt"
        FROM captures
        WHERE status = 'active'::"CaptureStatus"
          AND (
            parse_status IS NULL
            OR parse_status IN (
              'ambiguous'::"CaptureParseStatus",
              'failed'::"CaptureParseStatus"
            )
            OR COALESCE(created_items, '[]'::jsonb)
              @? '$[*] ? (@.type == "pending_capture")'
          )
        ORDER BY created_at DESC
        LIMIT 5
      `,
      prisma.task.findFirst({
        where: {
          status: "open",
          someday: false,
          dueDate: { gt: tomorrowDate },
        },
        orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }],
      }),
      prisma.calendarEvent.findFirst({
        where: { start: { gte: dayAfterTomorrowCalendarBounds.start } },
        orderBy: { start: "asc" },
      }),
      prisma.calendarSyncState.findUnique({
        where: { id: "google-primary" },
      }),
      prisma.appSetting.findUnique({
        where: { key: "google_calendar_stale_minutes" },
      }),
      prisma.area.findMany({
        where: { status: "active", isSystem: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.project.findMany({
        where: { status: { in: ["active", "parked", "someday"] } },
        select: { id: true, name: true, areaId: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.$queryRaw<UpcomingTaskCandidate[]>`
        SELECT
          id,
          title,
          due_date AS "dueDate",
          due_time AS "dueTime"
        FROM tasks
        WHERE status = 'open'::"TaskStatus"
          AND someday = false
          AND due_date > ${todayDate}::date
        ORDER BY
          due_date ASC,
          CASE
            WHEN due_time ~ '^[0-9]{1,2}:[0-9]{2}$' THEN
              LPAD(
                LEAST(GREATEST(SPLIT_PART(due_time, ':', 1)::integer, 0), 23)::text,
                2,
                '0'
              ) || ':' || LPAD(
                LEAST(GREATEST(SPLIT_PART(due_time, ':', 2)::integer, 0), 59)::text,
                2,
                '0'
              )
            ELSE '00:00'
          END ASC,
          created_at ASC,
          id ASC
        LIMIT 3
      `,
      prisma.calendarEvent.findMany({
        where: { start: { gte: todayCalendarBounds.end } },
        select: { id: true, title: true, start: true },
        orderBy: { start: "asc" },
        take: 3,
      }),
    ]);

    // Daily resurfacing selection is lazy: the first Today load of the day
    // picks the item; later loads reuse it. Failure here must never break
    // the Today screen.
    const resurfacedItem = await getDailyResurfacedItem().catch(() => null);

    // Today's due routines: plain checkable items. Uncompleted past
    // windows render nothing tomorrow — due-ness is computed per day.
    const routinesDueToday = await getRoutinesWithState(today)
      .then((routines) =>
        routines
          .filter((routine) => routine.status === "active" && routine.dueToday)
          .map((routine) => ({
            id: routine.id,
            name: routine.name,
            timeWindow: routine.scheduleParsed.timeWindow,
            completedToday: routine.satisfied,
          })),
      )
      .catch(() => []);

    const staleMinutes =
      typeof calendarStaleMinutesSetting?.value === "number"
        ? calendarStaleMinutesSetting.value
        : 30;
    const calendarSyncIsStale =
      !calendarSync?.lastSyncedAt ||
      Date.now() - calendarSync.lastSyncedAt.getTime() > staleMinutes * 60_000;
    const areaPaths = new Map(flattenAreaOptions(areas).map((area) => [area.id, area.path]));
    const withAreaPath = <T extends { areaId: string | null }>(task: T) => ({
      ...task,
      areaPath: task.areaId ? areaPaths.get(task.areaId) ?? null : null,
    });

    return {
      ready: true as const,
      generatedAt: new Date(),
      today,
      tomorrow,
      topTasks: topTasks.map(withAreaPath),
      starredCount,
      dueToday: dueToday.map(withAreaPath),
      dueTomorrow: dueTomorrow.map(withAreaPath),
      taskInbox: taskInbox.map(withAreaPath),
      todayEvents,
      tomorrowEvents,
      upcomingCommitments: mergeUpcomingCommitments(
        upcomingTasks,
        upcomingEvents,
      ),
      recentCaptures,
      nextTask,
      nextEvent,
      resurfacedItem,
      routinesDueToday,
      areas,
      destinationProjects,
      calendarSync: {
        status: calendarSync?.status ?? "not_configured",
        lastSyncedAt: calendarSync?.lastSyncedAt ?? null,
        lastSuccessfulSyncAt: calendarSync?.lastSuccessfulSyncAt ?? null,
        stale: calendarSyncIsStale,
        staleMinutes,
        error: calendarSync?.error ?? null,
      },
    };
  } catch {
    return {
      ready: false as const,
      today,
      tomorrow,
      reason: "Database is not migrated or reachable.",
    };
  }
}
