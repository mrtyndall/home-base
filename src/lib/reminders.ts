import { Prisma, type ReminderChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getTaskDueDateTime,
  normalizeTime,
  parseReminderOffsets,
} from "@/lib/tasks";

type ReminderCandidate = {
  task: {
    id: string;
    title: string;
    dueDate: Date | null;
    dueTime: string | null;
    reminderOffsets: Prisma.JsonValue | null;
  };
  offsetMinutes: number;
  scheduledAt: Date;
  overdue: boolean;
};

type DeliveryResult = {
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
};

const RECOVERY_GRACE_MS = 70_000;

export async function sendDueReminders(now = new Date()): Promise<DeliveryResult> {
  assertPushoverConfigured();

  const defaultMorningTime = await getDefaultMorningReminderTime();
  const tasks = await prisma.task.findMany({
    where: {
      status: "open",
      dueDate: { not: null },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      dueTime: true,
      reminderOffsets: true,
    },
    take: 500,
  });

  const candidates = tasks.flatMap((task) =>
    buildReminderCandidates(task, defaultMorningTime, now),
  );

  const result: DeliveryResult = {
    checked: candidates.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    const alreadyDelivered = await prisma.reminderDelivery.findUnique({
      where: {
        taskId_offsetMinutes_channel: {
          taskId: candidate.task.id,
          offsetMinutes: candidate.offsetMinutes,
          channel: "pushover",
        },
      },
    });

    if (alreadyDelivered) {
      result.skipped += 1;
      continue;
    }

    const delivery = await deliverPushoverReminder(candidate);
    if (delivery.ok) {
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}

function buildReminderCandidates(
  task: ReminderCandidate["task"],
  defaultMorningTime: string,
  now: Date,
) {
  const offsets =
    task.dueTime === null
      ? [0]
      : parseReminderOffsets(task.reminderOffsets);
  const dueAt = getTaskDueDateTime(task, defaultMorningTime);

  if (!dueAt || offsets.length === 0) {
    return [];
  }

  return offsets.flatMap((offsetMinutes) => {
    const scheduledAt = new Date(dueAt.getTime() - offsetMinutes * 60_000);
    if (scheduledAt > now) {
      return [];
    }

    return [
      {
        task,
        offsetMinutes,
        scheduledAt,
        overdue: now.getTime() - scheduledAt.getTime() > RECOVERY_GRACE_MS,
      },
    ];
  });
}

function assertPushoverConfigured() {
  if (!process.env.PUSHOVER_APP_TOKEN || !process.env.PUSHOVER_USER_KEY) {
    throw new Error("Pushover is not configured. Set PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY before running reminders.");
  }
}

async function deliverPushoverReminder(candidate: ReminderCandidate) {
  const token = process.env.PUSHOVER_APP_TOKEN as string;
  const user = process.env.PUSHOVER_USER_KEY as string;

  const title = candidate.overdue ? "Overdue reminder" : "Reminder";
  const message = candidate.overdue
    ? `${candidate.task.title} was due for a reminder at ${candidate.scheduledAt.toLocaleString()}.`
    : candidate.task.title;

  try {
    const response = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        user,
        title,
        message,
      }),
    });

    if (!response.ok) {
      return recordReminderDelivery(
        candidate,
        "pushover",
        false,
        `Pushover returned HTTP ${response.status}.`,
      );
    }

    return recordReminderDelivery(candidate, "pushover", true);
  } catch (error) {
    return recordReminderDelivery(
      candidate,
      "pushover",
      false,
      error instanceof Error ? error.message : "Pushover request failed.",
    );
  }
}

async function recordReminderDelivery(
  candidate: ReminderCandidate,
  channel: ReminderChannel,
  ok: boolean,
  error?: string,
) {
  try {
    const delivery = await prisma.reminderDelivery.create({
      data: {
        taskId: candidate.task.id,
        offsetMinutes: candidate.offsetMinutes,
        channel,
        deliveryStatus: ok ? "sent" : "failed",
        error,
      },
    });

    await prisma.notification.create({
      data: {
        type: ok ? "reminder_sent" : "reminder_failed",
        title: ok
          ? candidate.overdue
            ? "Overdue reminder sent"
            : "Reminder sent"
          : "Reminder delivery failed",
        body: candidate.task.title,
        sourceRef: {
          type: "reminder_delivery",
          id: delivery.id,
          taskId: candidate.task.id,
          channel,
          offsetMinutes: candidate.offsetMinutes,
          overdue: candidate.overdue,
        },
      },
    });

    return { ok, delivery };
  } catch (recordError) {
    if (
      recordError instanceof Prisma.PrismaClientKnownRequestError &&
      recordError.code === "P2002"
    ) {
      return { ok: true, duplicate: true };
    }

    throw recordError;
  }
}

async function getDefaultMorningReminderTime() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: "default_due_date_reminder_time" },
  });

  return normalizeTime(typeof setting?.value === "string" ? setting.value : "08:00");
}
