import { prisma } from "@/lib/db";
import {
  addDaysToDateString,
  dateOnlyFromString,
  localDateString,
} from "@/lib/dates";
import { getDailyResurfacedItem } from "@/lib/resurfacing";
import { getTodayTaskInboxLimit } from "@/lib/today-task-inbox";

export async function getTodayDashboard() {
  const today = localDateString();
  const tomorrow = addDaysToDateString(today, 1);
  const dayAfterTomorrow = addDaysToDateString(today, 2);
  const todayDate = dateOnlyFromString(today);
  const tomorrowDate = dateOnlyFromString(tomorrow);
  const dayAfterTomorrowDate = dateOnlyFromString(dayAfterTomorrow);

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
        orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }, { createdAt: "asc" }],
        take: 12,
      }),
      prisma.task.findMany({
        where: {
          status: "open",
          someday: false,
          dueDate: tomorrowDate,
        },
        include: { area: true, project: true },
        orderBy: [{ dueTime: "asc" }, { createdAt: "asc" }],
        take: 8,
      }),
      prisma.calendarEvent.findMany({
        where: {
          start: { gte: todayDate, lt: tomorrowDate },
        },
        orderBy: { start: "asc" },
        take: 8,
      }),
      prisma.calendarEvent.findMany({
        where: {
          start: { gte: tomorrowDate, lt: dayAfterTomorrowDate },
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
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: getTodayTaskInboxLimit(),
      }),
      prisma.capture.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.task.findFirst({
        where: {
          status: "open",
          someday: false,
          dueDate: { gt: tomorrowDate },
        },
        orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }],
      }),
      prisma.calendarEvent.findFirst({
        where: { start: { gte: dayAfterTomorrowDate } },
        orderBy: { start: "asc" },
      }),
      prisma.calendarSyncState.findUnique({
        where: { id: "google-primary" },
      }),
      prisma.appSetting.findUnique({
        where: { key: "google_calendar_stale_minutes" },
      }),
    ]);

    // Daily resurfacing selection is lazy: the first Today load of the day
    // picks the item; later loads reuse it. Failure here must never break
    // the Today screen.
    const resurfacedItem = await getDailyResurfacedItem().catch(() => null);

    const staleMinutes =
      typeof calendarStaleMinutesSetting?.value === "number"
        ? calendarStaleMinutesSetting.value
        : 30;
    const calendarSyncIsStale =
      !calendarSync?.lastSyncedAt ||
      Date.now() - calendarSync.lastSyncedAt.getTime() > staleMinutes * 60_000;

    return {
      ready: true as const,
      today,
      tomorrow,
      topTasks,
      starredCount,
      dueToday,
      dueTomorrow,
      taskInbox,
      todayEvents,
      tomorrowEvents,
      recentCaptures,
      nextTask,
      nextEvent,
      resurfacedItem,
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
