import { CheckCircle2, Inbox } from "lucide-react";
import type { Area, Capture, Domain } from "@prisma/client";
import Link from "next/link";
import { getTodayDashboard } from "@/lib/today";
import { formatDateOnly, formatShortDate, formatTime } from "@/lib/dates";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { TaskStarButton } from "@/components/task-star-button";
import { DraggableTaskLink, TaskDropZone } from "@/components/task-scheduling";
import { getRecentCaptureHref } from "@/lib/today-capture-actions";
import { ResurfacedMemory } from "@/components/resurfaced-memory";
import { TodayRoutinesLine } from "@/components/today-routines";
import { CaptureFileActions } from "@/components/capture-file-actions";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const data = await getTodayDashboard();

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          Today
        </h1>
      </header>

      {!data.ready ? (
        <section className="rounded-[14px] border border-amber-300 bg-amber-50 p-4 text-amber-950">
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
            <section className="space-y-2.5">
              <SectionHeader title="Top tasks" />
              <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
                {data.topTasks.map((task) => (
                  <TodayTaskRow
                    key={task.id}
                    task={task}
                    today={data.today}
                    tomorrow={data.tomorrow}
                    grouped
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

          <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-7">
              {data.todayEvents.length > 0 ? (
                <div className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <SectionHeader title="Today's calendar" />
                    <CalendarSyncMeta data={data.calendarSync} />
                  </div>
                  <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
                    {data.todayEvents.map((event) => {
                      const hasPassed =
                        event.end.getTime() <= data.generatedAt.getTime();
                      const quietClass = hasPassed
                        ? "text-stone-400 line-through"
                        : "text-stone-500";
                      return (
                        <div
                          key={event.id}
                          className="flex items-baseline gap-3 px-4 py-3"
                        >
                          <p className={`min-w-14 text-sm ${quietClass}`}>
                            {formatTime(event.start)}
                          </p>
                          <div className="min-w-0">
                            <h3
                              className={`text-[15px] font-medium ${
                                hasPassed ? "text-stone-400 line-through" : ""
                              }`}
                            >
                              {event.title}
                            </h3>
                            {event.location ? (
                              <p className={`mt-0.5 text-sm ${quietClass}`}>
                                {event.location}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2.5">
                <SectionHeader title="Due today" />
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

              <div className="space-y-2.5">
                <SectionHeader title="Tomorrow" />
                <div className="space-y-2">
                  {data.tomorrowEvents.length > 0 ? (
                    <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
                      {data.tomorrowEvents.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-baseline gap-3 px-4 py-3"
                        >
                          <p className="min-w-14 text-sm text-stone-500">
                            {formatTime(event.start)}
                          </p>
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-medium">
                              {event.title}
                            </h3>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
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
            </div>

            <div className="space-y-7">
              <TodayRoutinesLine routines={data.routinesDueToday} />
              <RecentCapturesStrip
                captures={data.recentCaptures}
                domains={data.domains}
              />
              <div className="space-y-2.5">
                <div className="rounded-[18px] border border-dashed border-[#D8DDD5] bg-white/55 p-3">
                  <SectionHeader title="Task inbox" />
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
              </div>
              <ResurfacedMemory item={data.resurfacedItem} />
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
  grouped = false,
}: {
  task: TodayTask;
  today: string;
  tomorrow: string;
  grouped?: boolean;
}) {
  const detail = `${task.area.name}${task.project ? ` / ${task.project.name}` : ""}`;

  return (
    <div
      className={
        grouped
          ? "flex items-start justify-between gap-3 p-4"
          : "flex items-start justify-between gap-3 rounded-[14px] border border-[#E2E6DF] bg-white p-4"
      }
    >
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

function RecentCapturesStrip({
  captures,
  domains,
}: {
  captures: RecentCapture[];
  domains: Array<Domain & { areas: Area[] }>;
}) {
  if (captures.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Recent captures
        </h2>
      </div>
      <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
        {captures.slice(0, 5).map((capture) => {
          const outcome =
            formatCaptureOutcome(capture.createdItems) ??
            capture.parseStatus ??
            "saved";
          const href = getRecentCaptureHref(capture);
          const pending = isPendingCapture(capture);

          return (
            <div
              key={capture.id}
              className="grid gap-3 px-4 py-3 transition hover:bg-[#F7F9F5] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <Link
                  href={href}
                  className="block truncate text-sm font-medium text-stone-900 transition hover:text-teal-700"
                >
                  {capture.rawText}
                </Link>
                <p className="mt-0.5 text-xs text-[#9AA096]">{outcome}</p>
              </div>
              {pending ? (
                <CaptureFileActions
                  captureId={capture.id}
                  domains={domains}
                  align="right"
                />
              ) : (
                <Link
                  href={href}
                  className="inline-flex h-[30px] shrink-0 items-center rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
                >
                  Open
                </Link>
              )}
            </div>
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
  const tone = needsAttention ? "text-amber-800" : "text-[#9AA096]";
  const message = !configured
    ? "Google Calendar is not configured yet."
    : data.lastSyncedAt
      ? `synced ${formatTime(data.lastSyncedAt)}`
      : "Calendar has not synced yet";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-xs ${tone}`}>
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
      <section className="flex items-start gap-2.5">
        <CheckCircle2 className="mt-0.5 shrink-0 text-teal-700" size={17} />
        <div>
          <h2 className="text-[15px] font-medium text-stone-950">
            Nothing due through tomorrow.
          </h2>
          <p className="mt-0.5 text-sm text-[#6B7268]">
            {nextCommitment} Nothing slipping.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-[15px] font-medium text-stone-950">
        {data.todayEvents.length} calendar event
        {data.todayEvents.length === 1 ? "" : "s"} and {data.dueToday.length}{" "}
        task{data.dueToday.length === 1 ? "" : "s"} due today.
      </h2>
      <p className="mt-0.5 text-sm text-[#6B7268]">Nothing slipping.</p>
    </section>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
      {title}
    </h2>
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

function isPendingCapture(capture: RecentCapture) {
  if (capture.status === "dismissed") {
    return false;
  }
  if (capture.parseStatus === "ambiguous" || capture.parseStatus === "failed") {
    return true;
  }
  return Array.isArray(capture.createdItems)
    ? capture.createdItems.some(
        (item) => isCreatedItem(item) && item.type === "pending_capture",
      )
    : false;
}
