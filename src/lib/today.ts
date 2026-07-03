import { prisma } from "@/lib/db";
import {
  addDaysToDateString,
  dateOnlyFromString,
  localDateString,
} from "@/lib/dates";

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
      dueToday,
      dueTomorrow,
      todayEvents,
      tomorrowEvents,
      recentCaptures,
      nextTask,
      nextEvent,
    ] = await Promise.all([
      prisma.task.findMany({
        where: {
          status: "open",
          dueDate: { lte: todayDate },
        },
        include: { domain: true, project: true },
        orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }, { createdAt: "asc" }],
        take: 12,
      }),
      prisma.task.findMany({
        where: {
          status: "open",
          dueDate: tomorrowDate,
        },
        include: { domain: true, project: true },
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
      prisma.capture.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.task.findFirst({
        where: {
          status: "open",
          dueDate: { gt: tomorrowDate },
        },
        orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }],
      }),
      prisma.calendarEvent.findFirst({
        where: { start: { gte: dayAfterTomorrowDate } },
        orderBy: { start: "asc" },
      }),
    ]);

    return {
      ready: true as const,
      today,
      tomorrow,
      dueToday,
      dueTomorrow,
      todayEvents,
      tomorrowEvents,
      recentCaptures,
      nextTask,
      nextEvent,
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
