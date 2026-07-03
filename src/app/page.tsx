import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { getTodayDashboard } from "@/lib/today";
import { formatDateOnly, formatShortDate, formatTime } from "@/lib/dates";
import { TaskCompleteButton } from "@/components/task-complete-button";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const data = await getTodayDashboard();

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-teal-700">
          Home Base
        </p>
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
              <div className="space-y-2">
                {data.dueToday.length === 0 ? (
                  <EmptyLine text="No tasks due today." />
                ) : (
                  data.dueToday.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white p-4"
                    >
                      <Link
                        href={`/tasks/${task.id}`}
                        className="-m-1 min-w-0 flex-1 rounded-md p-1 transition hover:bg-stone-50"
                      >
                        <h3 className="font-medium">{task.title}</h3>
                        <p className="mt-1 text-sm text-stone-500">
                          {task.domain.name}
                          {task.project ? ` / ${task.project.name}` : ""}
                        </p>
                      </Link>
                      <TaskCompleteButton taskId={task.id} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

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
                {data.dueTomorrow.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white p-4"
                  >
                    <Link
                      href={`/tasks/${task.id}`}
                      className="-m-1 min-w-0 flex-1 rounded-md p-1 transition hover:bg-stone-50"
                    >
                      <h3 className="font-medium">{task.title}</h3>
                      <p className="mt-1 text-sm text-stone-500">
                        {task.domain.name}
                        {task.project ? ` / ${task.project.name}` : ""}
                      </p>
                    </Link>
                    <TaskCompleteButton taskId={task.id} />
                  </div>
                ))}
                {data.tomorrowEvents.length === 0 &&
                data.dueTomorrow.length === 0 ? (
                  <EmptyLine text="Nothing due tomorrow." />
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeader icon={Inbox} title="Recently Captured" />
              <div className="flex gap-2 overflow-x-auto pb-1">
                {data.recentCaptures.length === 0 ? (
                  <EmptyLine text="No captures yet." />
                ) : (
                  data.recentCaptures.map((capture) => (
                    <div
                      key={capture.id}
                      className="min-w-56 rounded-lg border border-stone-200 bg-white p-3"
                    >
                      <p className="line-clamp-3 text-sm text-stone-800">
                        {capture.rawText}
                      </p>
                      <p className="mt-2 text-xs text-stone-500">
                        {formatCaptureOutcome(capture.createdItems) ??
                          capture.parseStatus ??
                          "saved"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
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
        <p>
          {message}
          {data.stale && configured
            ? ` Sync is stale beyond ${data.staleMinutes} minutes.`
            : ""}
          {data.error ? ` ${data.error}` : ""}
        </p>
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
