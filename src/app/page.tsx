import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  Inbox,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import type { Area, Capture, Domain } from "@prisma/client";
import { convertPendingCapture } from "@/app/actions";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { TaskStarButton } from "@/components/task-star-button";
import { DraggableTaskLink, TaskDropZone } from "@/components/task-scheduling";
import { prisma } from "@/lib/db";
import { getTodayDashboard } from "@/lib/today";
import { SetupNotice } from "@/components/setup-notice";
import { formatDateOnly } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const [todayData, homeData] = await Promise.all([
    getTodayDashboard(),
    getHomeData(),
  ]);

  if (!todayData.ready || !homeData.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-normal text-stone-950">
          Home
        </h1>
      </header>

      <section className="grid gap-4 md:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <ActionPanel
          icon={CalendarCheck2}
          title="Handle today"
          href="/today"
          hrefLabel="Open Today"
        >
          <TaskDropZone
            targetDate={todayData.today}
            label="Today"
            isEmpty={todayData.dueToday.length === 0}
            emptyText="Drop a task here to put it on today."
          >
            {todayData.dueToday.slice(0, 5).map((task) => (
              <HomeTaskRow
                key={task.id}
                task={task}
                today={todayData.today}
                tomorrow={todayData.tomorrow}
              />
            ))}
          </TaskDropZone>
        </ActionPanel>

        <CaptureActionPanel
          captures={homeData.pendingCaptures}
          domains={homeData.domains}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ActionPanel
          icon={ListTodo}
          title="Task inbox"
          href="/tasks#unscheduled"
          hrefLabel="Open Tasks"
        >
          <TaskDropZone
            targetDate={null}
            label="Task inbox"
            isEmpty={todayData.taskInbox.length === 0}
            emptyText="No unscheduled tasks."
          >
            {todayData.taskInbox.slice(0, 5).map((task) => (
              <HomeTaskRow
                key={task.id}
                task={task}
                today={todayData.today}
                tomorrow={todayData.tomorrow}
              />
            ))}
          </TaskDropZone>
        </ActionPanel>

        <ActionPanel
          icon={CalendarCheck2}
          title="Tomorrow"
          href="/today"
          hrefLabel="Open Today"
        >
          <TaskDropZone
            targetDate={todayData.tomorrow}
            label="Tomorrow"
            isEmpty={todayData.dueTomorrow.length === 0}
            emptyText="Drop a task here to put it on tomorrow."
          >
            {todayData.dueTomorrow.slice(0, 5).map((task) => (
              <HomeTaskRow
                key={task.id}
                task={task}
                today={todayData.today}
                tomorrow={todayData.tomorrow}
              />
            ))}
          </TaskDropZone>
        </ActionPanel>
      </section>
    </div>
  );
}

type ActionPanelProps = {
  icon: LucideIcon;
  title: string;
  href: string;
  hrefLabel: string;
  children: ReactNode;
};

function ActionPanel({
  icon: Icon,
  title,
  href,
  hrefLabel,
  children,
}: ActionPanelProps) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-stone-900">
          <Icon className="shrink-0 text-teal-700" size={18} />
          <h2 className="truncate text-base font-semibold">{title}</h2>
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
        >
          {hrefLabel}
          <ArrowRight size={15} />
        </Link>
      </div>
      {children}
    </section>
  );
}

type HomeTask = {
  id: string;
  title: string;
  dueDate: Date | null;
  starred: boolean;
  area: { name: string };
  project: { name: string } | null;
};

function HomeTaskRow({
  task,
  today,
  tomorrow,
}: {
  task: HomeTask;
  today: string;
  tomorrow: string;
}) {
  const detailParts = [
    task.area.name,
    task.project?.name,
    task.dueDate ? formatDateOnly(task.dueDate) : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50/70 p-3 transition hover:border-teal-300 hover:bg-white">
      <DraggableTaskLink
        taskId={task.id}
        href={`/tasks/${task.id}`}
        title={task.title}
        detail={detailParts.join(" / ")}
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

function CaptureActionPanel({
  captures,
  domains,
}: {
  captures: Capture[];
  domains: Array<Domain & { areas: Area[] }>;
}) {
  return (
    <ActionPanel
      icon={Inbox}
      title="Sort captures"
      href="/areas/area_inbox"
      hrefLabel="Open Inbox"
    >
      {captures.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
          No pending captures.
        </div>
      ) : (
        <div className="space-y-3">
          {captures.slice(0, 4).map((capture) => (
            <form
              key={capture.id}
              action={convertPendingCapture}
              className="rounded-lg border border-stone-200 bg-stone-50/70 p-3"
            >
              <input type="hidden" name="captureId" value={capture.id} />
              <p className="max-h-28 overflow-y-auto text-sm leading-6 text-stone-900">
                {capture.rawText}
              </p>
              <div className="mt-3 flex flex-col gap-2 border-t border-stone-200 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="flex min-w-0 items-center gap-2 text-sm text-stone-600">
                  <span className="shrink-0 font-medium text-stone-700">
                    Area
                  </span>
                  <select
                    name="areaId"
                    defaultValue="area_inbox"
                    className="h-9 min-w-0 rounded-md border border-stone-300 bg-white px-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  >
                    {domains.map((domain) => (
                      <optgroup key={domain.id} label={domain.name}>
                        {domain.areas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <ConvertButton value="task" label="Task" />
                  <ConvertButton value="idea" label="Idea" />
                  <ConvertButton value="note" label="Note" />
                  <ConvertButton value="reference" label="Reference" />
                </div>
              </div>
            </form>
          ))}
        </div>
      )}
    </ActionPanel>
  );
}

function ConvertButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="submit"
      name="targetType"
      value={value}
      className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
    >
      {label}
    </button>
  );
}

async function getHomeData() {
  try {
    const [
      pendingCaptures,
      domains,
    ] = await Promise.all([
      prisma.capture.findMany({
        where: { parseStatus: { in: ["ambiguous", "failed"] } },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.domain.findMany({
        include: {
          areas: {
            where: { status: "active" },
            orderBy: { name: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      ok: true as const,
      pendingCaptures,
      domains,
    };
  } catch {
    return { ok: false as const };
  }
}
