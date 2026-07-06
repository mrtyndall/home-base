"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, GripVertical } from "lucide-react";
import { HomeTaskActions } from "@/components/home-action-buttons";

export type HomeTodayEvent = {
  id: string;
  title: string;
  time: string;
};

export type HomeTodayTask = {
  id: string;
  title: string;
  detail: string;
  starred: boolean;
};

export function HomeTodayList({
  events,
  tasks,
  maxRows = 5,
}: {
  events: HomeTodayEvent[];
  tasks: HomeTodayTask[];
  maxRows?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [overTaskId, setOverTaskId] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const eventRows = events.slice(0, maxRows);
  const taskSlots = Math.max(0, maxRows - eventRows.length);
  const taskRows = tasks.slice(0, taskSlots);
  const remaining = Math.max(0, events.length + tasks.length - maxRows);

  async function reorderTask(targetTaskId: string) {
    if (!draggingTaskId || draggingTaskId === targetTaskId) {
      return;
    }

    setPendingTaskId(draggingTaskId);
    try {
      const response = await fetch(`/api/tasks/${draggingTaskId}/order`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetTaskId }),
      });
      if (response.ok) {
        startTransition(() => router.refresh());
      }
    } finally {
      setPendingTaskId(null);
      setDraggingTaskId(null);
      setOverTaskId(null);
    }
  }

  if (events.length === 0 && tasks.length === 0) {
    return <p className="py-3 text-sm text-stone-500">No commitments today.</p>;
  }

  return (
    <div className="space-y-3">
      {eventRows.length > 0 ? (
        <div className="space-y-2">
          {eventRows.map((event) => (
            <Link
              key={event.id}
              href="/today"
              className="flex items-start gap-3 rounded-[12px] border border-teal-700/15 bg-[#F4FBF7] px-3 py-2.5 transition hover:border-teal-700/35 hover:bg-[#EFF8F3]"
            >
              <CalendarClock
                size={17}
                className="mt-0.5 shrink-0 text-teal-700"
              />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium leading-snug text-stone-950">
                  {event.title}
                </span>
                <span className="mt-0.5 block text-[13px] text-[#6B7268]">
                  {event.time}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {taskRows.length > 0 ? (
        <div className="divide-y divide-[#EEF1EC]">
          {taskRows.map((task) => {
            const isDragging = draggingTaskId === task.id;
            const isTarget = overTaskId === task.id && draggingTaskId !== task.id;
            const isPending = pendingTaskId === task.id;

            return (
              <div
                key={task.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", task.id);
                  setDraggingTaskId(task.id);
                }}
                onDragOver={(event) => {
                  if (!draggingTaskId || draggingTaskId === task.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverTaskId(task.id);
                }}
                onDragLeave={() => {
                  setOverTaskId((current) =>
                    current === task.id ? null : current,
                  );
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void reorderTask(task.id);
                }}
                onDragEnd={() => {
                  setDraggingTaskId(null);
                  setOverTaskId(null);
                }}
                className={`-mx-2 flex items-start justify-between gap-3 rounded-[12px] px-2 py-3 transition ${
                  isTarget
                    ? "bg-teal-50 ring-1 ring-teal-700/30"
                    : isDragging
                      ? "bg-stone-50 opacity-70"
                      : "hover:bg-stone-50"
                } ${isPending ? "opacity-60" : ""}`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <button
                    type="button"
                    title="Drag to reorder"
                    aria-label="Drag to reorder"
                    className="mt-0.5 grid h-6 w-5 shrink-0 cursor-grab place-items-center text-[#B0B7AD] active:cursor-grabbing"
                  >
                    <GripVertical size={15} />
                  </button>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="min-w-0 flex-1 rounded-[10px] transition hover:text-teal-700"
                  >
                    <p className="text-[15px] font-medium text-stone-950">
                      {task.title}
                    </p>
                    {task.detail ? (
                      <p className="mt-0.5 text-[13px] text-[#6B7268]">
                        {task.detail}
                      </p>
                    ) : null}
                  </Link>
                </div>
                <HomeTaskActions taskId={task.id} starred={task.starred} />
              </div>
            );
          })}
        </div>
      ) : null}

      {remaining > 0 ? (
        <Link
          href="/today"
          className="block rounded-[10px] py-2 text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-teal-700 hover:underline"
        >
          and {remaining} more → Today
        </Link>
      ) : null}
    </div>
  );
}
