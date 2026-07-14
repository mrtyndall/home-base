import type { CalendarEvent, Task } from "@prisma/client";
import { getTaskDueDateTime } from "@/lib/tasks";

type UpcomingTask = Pick<Task, "id" | "title" | "dueDate" | "dueTime">;
type UpcomingEvent = Pick<CalendarEvent, "id" | "title" | "start">;

export type UpcomingCommitment =
  | {
      kind: "task";
      id: string;
      title: string;
      at: Date;
      date: Date;
      time?: string;
    }
  | {
      kind: "event";
      id: string;
      title: string;
      at: Date;
      date: Date;
      time?: never;
    };

export function mergeUpcomingCommitments(
  tasks: UpcomingTask[],
  events: UpcomingEvent[],
  limit = 3,
): UpcomingCommitment[] {
  const taskItems = tasks.flatMap((task): UpcomingCommitment[] => {
    const at = getTaskDueDateTime(task);

    if (!task.dueDate || !at) {
      return [];
    }

    return [
      {
        kind: "task",
        id: task.id,
        title: task.title,
        at,
        date: task.dueDate,
        ...(task.dueTime ? { time: task.dueTime } : {}),
      },
    ];
  });
  const eventItems: UpcomingCommitment[] = events.map((event) => ({
    kind: "event",
    id: event.id,
    title: event.title,
    at: event.start,
    date: event.start,
  }));

  return [...taskItems, ...eventItems]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, limit);
}
