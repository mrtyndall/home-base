import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  RefreshCcw,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { Capture } from "@prisma/client";
import Link from "next/link";
import { getTodayDashboard } from "@/lib/today";
import { formatDateOnly, formatShortDate, formatTime } from "@/lib/dates";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { TaskStarButton } from "@/components/task-star-button";
import { DraggableTaskLink, TaskDropZone } from "@/components/task-scheduling";
import {
  getRecentCaptureAction,
  getRecentCaptureHref,
} from "@/lib/today-capture-actions";

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

          {data.topTasks.length > 0 ? (
            <section className="space-y-3">
              <SectionHeader icon={Star} title="Top Tasks" />
              <div className="space-y-2">
                {data.topTasks.map((task) => (
                  <TodayTaskRow
                    key={task.id}
                    task={task}
                    today={data.today}
                    tomorrow={data.tomorrow}
                  />
                ))}
              </div>
              {data.starredCount > data.topTasks.length ? (
                <Link
                  href="/tasks?starred=1"
                  className="inline-block text-sm text-stone-500 underline-offset-4 transition hover:text-stone-800 hover:underline"
                >
                  {data.starredCount - data.topTasks.length} more starred in
                  Tasks
                </Link>
              ) : null}
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <SectionHeader icon={CalendarDays} title="Today's Calendar" />
              <CalendarSyncMeta data={data.calendarSync} />
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

            <div className="space-y-3">
              <SectionHeader icon={Inbox} title="Task inbox" />
              <TaskDropZone
                targetDate={null}
                label="Task inbox"
                isEmpty={data.taskInbox.length === 0}
                emptyText="No unscheduled tasks."
              >
                {data.taskInbox.map((task) => (
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
        </>
      )}
    </div>
  );
}

type TodayTask = {
  id: string;
  title: string;
  dueDate: Date | null;
  starred: boolean;
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
      <div className="flex shrink-0 items-center gap-1.5">
        <TaskStarButton taskId={task.id} starred={task.starred} />
        <TaskCompleteButton taskId={task.id} />
      </div>
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
        <h2 className="text-sm font-semibold">Recent capture actions</h2>
      </div>
      <div className="space-y-2">
        {captures.slice(0, 5).map((capture) => {
          const outcome =
            formatCaptureOutcome(capture.createdItems) ??
            capture.parseStatus ??
            "saved";
          const href = getRecentCaptureHref(capture);
          const action = getRecentCaptureAction(
            capture.createdItems,
            capture.parseStatus,
          );

          return (
            <Link
              key={capture.id}
              href={href}
              className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3 transition hover:border-teal-400 hover:bg-white sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-900">
                  {capture.rawText}
                </p>
                <p className="mt-1 text-xs text-stone-500">{outcome}</p>
              </div>
              <span
                className={`inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                  action.tone === "primary"
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-stone-300 bg-white text-stone-700"
                }`}
              >
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function CalendarSyncMeta({
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
  const needsAttention = !configured || data.stale || data.status === "failed";
  const tone = needsAttention ? "text-amber-800" : "text-stone-500";
  const message = !configured
    ? "Google Calendar is not configured yet."
    : data.lastSyncedAt
      ? `Calendar synced ${formatTime(data.lastSyncedAt)}`
      : "Calendar has not synced yet";

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${tone}`}>
      <RefreshCcw className="shrink-0" size={13} />
      <p>
        {message}
        {data.stale && configured
          ? ` · stale beyond ${data.staleMinutes} minutes`
          : ""}
        {data.error ? ` · ${data.error}` : ""}
      </p>
      {!configured ? (
        <Link
          href="/settings"
          className="font-medium underline-offset-4 hover:underline"
        >
          Open settings
        </Link>
      ) : null}
    </div>
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

  const filedItems = value
    .filter(isCreatedItem)
    .filter((item) => item.type !== "pending_capture");
  const pendingItems = value.filter(isCreatedItem);
  const labels =
    filedItems.length > 0
      ? filedItems
          .slice()
          .reverse()
          .map((item) => item.label)
          .filter((label) => !label.startsWith("Saved to Inbox to sort later"))
      : pendingItems
          .slice()
          .reverse()
          .map((item) => item.label);

  return labels.length > 0 ? labels.slice(0, 2).join("; ") : null;
}

function isCreatedItem(
  item: unknown,
): item is { type: string; id: string; label: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    typeof item.type === "string" &&
    item.type !== "notification" &&
    "id" in item &&
    typeof item.id === "string" &&
    "label" in item &&
    typeof item.label === "string"
  );
}
