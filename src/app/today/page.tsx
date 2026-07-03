import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";
import type { Capture } from "@prisma/client";
import Link from "next/link";
import { getTodayDashboard } from "@/lib/today";
import { formatDateOnly, formatShortDate, formatTime } from "@/lib/dates";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { DraggableTaskLink, TaskDropZone } from "@/components/task-scheduling";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const data = await getTodayDashboard();

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-normal text-stone-950">
          Today
        </h1>
      </header>

      {!data.ready ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <div className="flex items-start gap-3">
            <Inbox className="mt-0.5 shrink-0" size={19} />
            <div>
              <h2 className="text-base font-semibold">Foundation ready</h2>
              <p className="mt-1 text-sm">{data.reason}</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <StatusLine data={data} />
          <CalendarSyncLine data={data.calendarSync} />

          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <SectionHeader icon={CalendarDays} title="Today's Calendar" />
              <div className="space-y-2">
                {data.todayEvents.length === 0 ? (
                  <EmptyLine text="No calendar events today." />
                ) : (
                  data.todayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-stone-200 bg-white p-4"
                    >
                      <p className="text-sm text-stone-500">
                        {formatTime(event.start)}
                      </p>
                      <h3 className="mt-1 font-medium">{event.title}</h3>
                      {event.location ? (
                        <p className="mt-1 text-sm text-stone-600">
                          {event.location}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeader icon={Clock3} title="Due Today" />
              <TaskDropZone
                targetDate={data.today}
                label="Today"
                isEmpty={data.dueToday.length === 0}
                emptyText="No tasks due today."
              >
                {data.dueToday.map((task) => (
                  <TodayTaskRow
                    key={task.id}
                    task={task}
                    today={data.today}
                    tomorrow={data.tomorrow}
                  />
                ))}
              </TaskDropZone>
            </div>
          </section>

          <RecentCapturesStrip captures={data.recentCaptures} />

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <SectionHeader icon={CalendarDays} title="Tomorrow" />
              <div className="space-y-2">
                {data.tomorrowEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-stone-200 bg-white p-4"
                  >
                    <p className="text-sm text-stone-500">
                      {formatTime(event.start)}
                    </p>
                    <h3 className="mt-1 font-medium">{event.title}</h3>
                  </div>
                ))}
                <TaskDropZone
                  targetDate={data.tomorrow}
                  label="Tomorrow"
                  isEmpty={data.dueTomorrow.length === 0}
                  emptyText={
                    data.tomorrowEvents.length === 0
                      ? "Nothing due tomorrow."
                      : "No tasks due tomorrow."
                  }
                >
                  {data.dueTomorrow.map((task) => (
                    <TodayTaskRow
                      key={task.id}
                      task={task}
                      today={data.today}
                      tomorrow={data.tomorrow}
                    />
                  ))}
                </TaskDropZone>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type TodayTask = {
  id: string;
  title: string;
  dueDate: Date | null;
  area: { name: string };
  project: { name: string } | null;
};

function TodayTaskRow({
  task,
  today,
  tomorrow,
}: {
  task: TodayTask;
  today: string;
  tomorrow: string;
}) {
  const detail = `${task.area.name}${task.project ? ` / ${task.project.name}` : ""}`;

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white p-4">
      <DraggableTaskLink
        taskId={task.id}
        href={`/tasks/${task.id}`}
        title={task.title}
        detail={detail}
        currentDueDate={task.dueDate?.toISOString().slice(0, 10) ?? null}
        today={today}
        tomorrow={tomorrow}
      />
      <TaskCompleteButton taskId={task.id} />
    </div>
  );
}

type RecentCapture = Capture;

function RecentCapturesStrip({ captures }: { captures: RecentCapture[] }) {
  if (captures.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-stone-800">
        <Inbox size={16} />
        <h2 className="text-sm font-semibold">Recently captured</h2>
      </div>
      <div className="divide-y divide-stone-100">
        {captures.slice(0, 5).map((capture) => {
          const outcome =
            formatCaptureOutcome(capture.createdItems) ??
            capture.parseStatus ??
            "saved";
          const href = getCaptureHref(capture);

          return (
            <Link
              key={capture.id}
              href={href}
              className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4"
            >
              <p className="min-w-0 truncate text-sm text-stone-900">
                {capture.rawText}
              </p>
              <p className="text-xs text-stone-500 sm:text-right">{outcome}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function getCaptureHref(capture: Capture) {
  const items = Array.isArray(capture.createdItems) ? capture.createdItems : [];
  const firstItem = items.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      "id" in item &&
      typeof item.type === "string" &&
      typeof item.id === "string",
  ) as { type: string; id: string } | undefined;

  if (!firstItem) {
    return `/areas/area_inbox`;
  }

  if (firstItem.type === "task") return `/tasks/${firstItem.id}`;
  if (firstItem.type === "project") return `/projects/${firstItem.id}`;
  if (firstItem.type === "idea") return `/ideas`;
  if (firstItem.type === "pending_capture") return `/areas/area_inbox`;
  return `/search?q=${encodeURIComponent(capture.rawText)}`;
}

function CalendarSyncLine({
  data,
}: {
  data: {
    status: string;
    lastSyncedAt: Date | null;
    stale: boolean;
    staleMinutes: number;
    error: string | null;
  };
}) {
  const configured = data.status !== "not_configured";
  const tone = !configured || data.stale || data.status === "failed"
    ? "border-amber-300 bg-amber-50 text-amber-950"
    : "border-stone-200 bg-white text-stone-700";
  const message = !configured
    ? "Google Calendar is not configured yet."
    : data.lastSyncedAt
      ? `Google Calendar last synced ${formatTime(data.lastSyncedAt)}.`
      : "Google Calendar has not synced yet.";

  return (
    <section className={`rounded-lg border p-3 text-sm ${tone}`}>
      <div className="flex items-start gap-2">
        <RefreshCcw className="mt-0.5 shrink-0" size={16} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <p>
            {message}
            {data.stale && configured
              ? ` Sync is stale beyond ${data.staleMinutes} minutes.`
              : ""}
            {data.error ? ` ${data.error}` : ""}
          </p>
          {!configured ? (
            <Link
              href="/settings"
              className="font-medium text-amber-950 underline-offset-4 hover:underline"
            >
              Open settings
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StatusLine({
  data,
}: {
  data: Awaited<ReturnType<typeof getTodayDashboard>> & { ready: true };
}) {
  const clearThroughTomorrow =
    data.dueToday.length === 0 &&
    data.dueTomorrow.length === 0 &&
    data.todayEvents.length === 0 &&
    data.tomorrowEvents.length === 0;

  if (clearThroughTomorrow) {
    const nextCommitment = data.nextEvent
      ? `Next commitment ${formatShortDate(data.nextEvent.start)} at ${formatTime(data.nextEvent.start)}.`
      : data.nextTask
        ? `Next task due ${formatDateOnly(data.nextTask.dueDate)}.`
        : "No upcoming dated commitments.";

    return (
      <section className="rounded-lg border border-teal-300 bg-teal-50 p-5 text-teal-950">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0" size={21} />
          <div>
            <h2 className="text-lg font-semibold">
              Nothing due through tomorrow.
            </h2>
            <p className="mt-1 text-sm">{nextCommitment} Nothing slipping.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-cyan-300 bg-cyan-50 p-5 text-cyan-950">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 shrink-0" size={21} />
        <div>
          <h2 className="text-lg font-semibold">Today has active items.</h2>
          <p className="mt-1 text-sm">
            {data.todayEvents.length} calendar event
            {data.todayEvents.length === 1 ? "" : "s"} and{" "}
            {data.dueToday.length} task
            {data.dueToday.length === 1 ? "" : "s"} due today.
          </p>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-stone-800">
      <Icon size={18} />
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
      {text}
    </div>
  );
}

function formatCaptureOutcome(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const labels = value
    .map((item) => {
      if (
        typeof item === "object" &&
        item !== null &&
        "label" in item &&
        typeof item.label === "string" &&
        (!("type" in item) || item.type !== "notification")
      ) {
        return item.label;
      }

      return null;
    })
    .filter((label): label is string => Boolean(label));

  return labels.length > 0 ? labels.slice(0, 2).join("; ") : null;
}
