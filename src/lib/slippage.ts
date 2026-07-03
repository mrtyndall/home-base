import { prisma } from "@/lib/db";
import { formatShortDate } from "@/lib/dates";

export const DEFAULT_TASK_SLIP_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getTaskSlipDays() {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "task_slip_days" },
    });
    return typeof setting?.value === "number" && setting.value > 0
      ? setting.value
      : DEFAULT_TASK_SLIP_DAYS;
  } catch {
    return DEFAULT_TASK_SLIP_DAYS;
  }
}

/**
 * Plain fact for a long-open task: "open since Jun 12".
 * Only for open, non-someday tasks with no activity inside the threshold.
 * Never a color, badge, or sort input.
 */
export function taskOpenSinceFact(
  task: {
    status: string;
    someday: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  slipDays: number,
  now: Date = new Date(),
) {
  if (task.status !== "open" || task.someday) {
    return null;
  }

  const cutoff = now.getTime() - slipDays * DAY_MS;
  if (
    task.createdAt.getTime() > cutoff ||
    task.updatedAt.getTime() > cutoff
  ) {
    return null;
  }

  return `open since ${formatShortDate(task.createdAt)}`;
}

/**
 * Plain fact for a slipping active project: "Last activity Jun 20".
 * Parked, someday, completed, and killed projects never slip.
 */
export function projectLastActivityFact(
  project: { status: string; slipThresholdDays: number },
  lastActivity: Date | null,
  now: Date = new Date(),
) {
  if (project.status !== "active" || !lastActivity) {
    return null;
  }

  const cutoff = now.getTime() - project.slipThresholdDays * DAY_MS;
  if (lastActivity.getTime() > cutoff) {
    return null;
  }

  return `Last activity ${formatShortDate(lastActivity)}`;
}
