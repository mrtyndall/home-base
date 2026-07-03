import type { Prisma, Routine, RoutineCompletion } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import {
  addDaysToDateString,
  APP_TIMEZONE,
  localDateString,
} from "@/lib/dates";

export type RoutineTimeWindow = "morning" | "afternoon" | "evening" | "anytime";

export type RoutineSchedule = {
  frequency: "daily" | "weekly" | "custom";
  days: string[];
  timeWindow: RoutineTimeWindow;
};

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function parseRoutineSchedule(value: Prisma.JsonValue): RoutineSchedule {
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const frequency =
    record.frequency === "weekly" || record.frequency === "custom"
      ? record.frequency
      : "daily";
  const days = Array.isArray(record.days)
    ? record.days
        .map((day) => String(day).slice(0, 3).toLowerCase())
        .filter((day) => WEEKDAYS.includes(day))
    : [];
  const timeWindow =
    record.timeWindow === "morning" ||
    record.timeWindow === "afternoon" ||
    record.timeWindow === "evening"
      ? record.timeWindow
      : "anytime";

  return { frequency, days, timeWindow };
}

export function parseGraceDays(value: Prisma.JsonValue | null): number {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const days = (value as Record<string, unknown>).days;
    if (typeof days === "number" && days >= 0) {
      return Math.trunc(days);
    }
  }
  return 0;
}

function weekdayOf(dateStr: string) {
  return formatInTimeZone(
    new Date(`${dateStr}T12:00:00.000Z`),
    "UTC",
    "EEE",
  ).toLowerCase();
}

export function isScheduledOn(schedule: RoutineSchedule, dateStr: string) {
  if (schedule.frequency === "daily") {
    return true;
  }
  if (schedule.frequency === "custom") {
    return schedule.days.includes(weekdayOf(dateStr));
  }
  // weekly: due any day until completed that week (see isDueToday).
  return true;
}

export function completionDateStrings(completions: Array<Pick<RoutineCompletion, "completedAt">>) {
  return new Set(
    completions.map((completion) =>
      formatInTimeZone(completion.completedAt, APP_TIMEZONE, "yyyy-MM-dd"),
    ),
  );
}

function startOfWeek(dateStr: string) {
  // ISO week, Monday start.
  let cursor = dateStr;
  while (weekdayOf(cursor) !== "mon") {
    cursor = addDaysToDateString(cursor, -1);
  }
  return cursor;
}

export function isWithinActiveDates(
  routine: Pick<Routine, "startDate" | "endDate">,
  dateStr: string,
) {
  const start = routine.startDate?.toISOString().slice(0, 10);
  const end = routine.endDate?.toISOString().slice(0, 10);
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

export function isDueToday(
  routine: Pick<Routine, "status" | "startDate" | "endDate" | "schedule">,
  completedDates: Set<string>,
  todayStr = localDateString(),
) {
  if (routine.status !== "active") return false;
  if (!isWithinActiveDates(routine, todayStr)) return false;

  const schedule = parseRoutineSchedule(routine.schedule);
  if (schedule.frequency === "weekly") {
    // Due until completed once this week; completed weeks render as done.
    let cursor = startOfWeek(todayStr);
    while (cursor <= todayStr) {
      if (completedDates.has(cursor)) return true; // due & already done today's row shows done
      cursor = addDaysToDateString(cursor, 1);
    }
    return true;
  }

  return isScheduledOn(schedule, todayStr);
}

export function isCompletedToday(
  completedDates: Set<string>,
  todayStr = localDateString(),
) {
  return completedDates.has(todayStr);
}

export function isCompletedThisWeek(
  completedDates: Set<string>,
  todayStr = localDateString(),
) {
  let cursor = startOfWeek(todayStr);
  while (cursor <= todayStr) {
    if (completedDates.has(cursor)) return true;
    cursor = addDaysToDateString(cursor, 1);
  }
  return false;
}

/**
 * Current run length as a plain fact. Daily/custom routines count
 * consecutive scheduled days completed; weekly routines count consecutive
 * completed weeks. Missed scheduled days inside the grace window do not
 * end the run. A gap beyond grace simply ends the count — never framed
 * as failure.
 */
export function computeRunLength(
  routine: Pick<Routine, "schedule" | "graceWindow" | "startDate" | "endDate">,
  completions: Array<Pick<RoutineCompletion, "completedAt">>,
  todayStr = localDateString(),
) {
  const schedule = parseRoutineSchedule(routine.schedule);
  const grace = parseGraceDays(routine.graceWindow);
  const completed = completionDateStrings(completions);

  if (schedule.frequency === "weekly") {
    let run = 0;
    let weekStart = startOfWeek(todayStr);
    if (weekHasCompletion(completed, weekStart, todayStr)) {
      run += 1;
    }
    // Past weeks: walk back while each full week has a completion.
    for (let i = 0; i < 60; i += 1) {
      const prevStart = addDaysToDateString(weekStart, -7);
      const prevEnd = addDaysToDateString(weekStart, -1);
      if (!isWithinActiveDates(routine, prevEnd)) break;
      if (!weekHasCompletion(completed, prevStart, prevEnd)) break;
      run += 1;
      weekStart = prevStart;
    }
    return run;
  }

  let run = 0;
  let misses = 0;

  // Today counts if done; an incomplete today is not a miss (day isn't over).
  let cursor = todayStr;
  if (completed.has(cursor)) {
    run += 1;
  }
  cursor = addDaysToDateString(cursor, -1);

  for (let i = 0; i < 400; i += 1) {
    if (!isWithinActiveDates(routine, cursor)) break;
    if (!isScheduledOn(schedule, cursor)) {
      cursor = addDaysToDateString(cursor, -1);
      continue;
    }
    if (completed.has(cursor)) {
      run += 1;
      misses = 0;
    } else {
      misses += 1;
      if (misses > grace) break;
    }
    cursor = addDaysToDateString(cursor, -1);
  }

  return run;
}

function weekHasCompletion(
  completed: Set<string>,
  weekStart: string,
  through: string,
) {
  let cursor = weekStart;
  const end =
    through < addDaysToDateString(weekStart, 6)
      ? through
      : addDaysToDateString(weekStart, 6);
  while (cursor <= end) {
    if (completed.has(cursor)) return true;
    cursor = addDaysToDateString(cursor, 1);
  }
  return false;
}

/** Lazy auto-retire: temporary routines past endDate become retired (history kept). */
export async function autoRetireRoutines(todayStr = localDateString()) {
  const cutoff = new Date(`${todayStr}T00:00:00.000Z`);
  const expired = await prisma.routine.findMany({
    where: {
      status: "active",
      temporary: true,
      endDate: { lt: cutoff },
    },
    select: { id: true, name: true },
  });

  for (const routine of expired) {
    await prisma.routine.update({
      where: { id: routine.id },
      data: { status: "retired" },
    });
    await prisma.notification.create({
      data: {
        type: "routine_retired",
        title: "Routine retired",
        body: `${routine.name} reached its end date. History kept.`,
        sourceRef: { type: "routine", id: routine.id, source: "scheduler" },
      },
    });
  }

  return expired.length;
}

export async function completeRoutineById(
  routineId: string,
  actor: { source: "manual" | "capture" | "api"; label?: string },
  value?: string | null,
) {
  const routine = await prisma.routine.findUnique({
    where: { id: routineId },
    select: { id: true, name: true, status: true },
  });
  if (!routine || routine.status !== "active") {
    throw new Error("Routine not found or not active.");
  }

  // One completion per day; a second tap is a no-op, never an error state.
  const todayStr = localDateString();
  const latest = await prisma.routineCompletion.findFirst({
    where: { routineId },
    orderBy: { completedAt: "desc" },
  });
  if (latest && completionDateStrings([latest]).has(todayStr)) {
    return { routine, completion: latest, repeated: true as const };
  }

  const completion = await prisma.routineCompletion.create({
    data: { routineId, value: value ?? undefined },
  });

  await prisma.notification.create({
    data: {
      type: "routine_completed",
      title: "Routine completed",
      body: routine.name,
      sourceRef: {
        type: "routine",
        id: routine.id,
        source: actor.source,
        actor: actor.label ?? null,
      },
    },
  });

  return { routine, completion, repeated: false as const };
}

export async function completeRoutineByMatch(
  routineMatch: string,
  actor: { source: "manual" | "capture" | "api"; label?: string },
  value?: string | null,
) {
  const routine = await prisma.routine.findFirst({
    where: {
      status: "active",
      name: { contains: routineMatch, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!routine) {
    throw new Error(`No active routine matched "${routineMatch}".`);
  }
  return completeRoutineById(routine.id, actor, value);
}

export async function getRoutinesWithState(todayStr = localDateString()) {
  await autoRetireRoutines(todayStr);

  const routines = await prisma.routine.findMany({
    where: { status: { in: ["active", "paused", "retired"] } },
    include: {
      area: true,
      completions: { orderBy: { completedAt: "desc" }, take: 60 },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  return routines.map((routine) => {
    const schedule = parseRoutineSchedule(routine.schedule);
    const completedDates = completionDateStrings(routine.completions);
    return {
      ...routine,
      scheduleParsed: schedule,
      dueToday: isDueToday(routine, completedDates, todayStr),
      completedToday:
        schedule.frequency === "weekly"
          ? isCompletedThisWeek(completedDates, todayStr)
          : isCompletedToday(completedDates, todayStr),
      runLength: computeRunLength(routine, routine.completions, todayStr),
    };
  });
}
