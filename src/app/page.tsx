import Link from "next/link";
import { Archive, ArrowRight, CheckCircle2, Repeat } from "lucide-react";
import { SetupNotice } from "@/components/setup-notice";
import {
  HomeRoutineCheck,
  HomeTaskActions,
} from "@/components/home-action-buttons";
import { CaptureFileActions } from "@/components/capture-file-actions";
import { prisma } from "@/lib/db";
import {
  formatDateOnly,
  formatShortDate,
  formatTime,
  localDateString,
  dateOnlyFromString,
} from "@/lib/dates";
import { getTodayDashboard } from "@/lib/today";
import { projectLastActivityFact } from "@/lib/slippage";
import type { ResurfacedItem } from "@/lib/resurfacing";

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

  const masthead = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          {masthead}
        </h1>
      </header>

      <StatusLine
        dueTodayCount={todayData.dueToday.length + todayData.todayEvents.length}
        clearThroughTomorrow={
          todayData.dueToday.length === 0 &&
          todayData.dueTomorrow.length === 0 &&
          todayData.todayEvents.length === 0 &&
          todayData.tomorrowEvents.length === 0
        }
        nextCommitment={getNextCommitment(todayData)}
        slippingProjectCount={homeData.slippingProjectCount}
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5 lg:order-2">
          {todayData.topTasks.length > 0 ? (
            <section className="rounded-[14px] border border-[#E2E6DF] bg-white p-4">
              <SectionHeader title="Top tasks" href="/tasks?starred=1" />
              <div className="mt-3 divide-y divide-[#EEF1EC]">
                {todayData.topTasks.slice(0, 3).map((task) => (
                  <TaskReceiptRow key={task.id} task={task} />
                ))}
              </div>
            </section>
          ) : null}

          <RoutinesLine routines={todayData.routinesDueToday} />
        </div>

        <section className="rounded-[14px] border border-[#E2E6DF] bg-white p-4 lg:order-1">
          <SectionHeader title="Today" href="/today" />
          <div className="mt-3 divide-y divide-[#EEF1EC]">
            <TodayRows data={todayData} />
          </div>
        </section>
      </div>

      <PulseRow
        freshCheckInCount={homeData.freshCheckInCount}
        slippingProjectCount={homeData.slippingProjectCount}
        pendingCaptureCount={homeData.pendingCaptureCount}
        reviewDueCount={homeData.reviewDueCount}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <RecentCaptures
          captures={todayData.recentCaptures}
          domains={todayData.domains}
        />

        <MemoryCard item={todayData.resurfacedItem} />
      </div>
    </div>
  );
}

type ReadyToday = Awaited<ReturnType<typeof getTodayDashboard>> & {
  ready: true;
};

type HomeTask = ReadyToday["dueToday"][number];

function StatusLine({
  dueTodayCount,
  clearThroughTomorrow,
  nextCommitment,
  slippingProjectCount,
}: {
  dueTodayCount: number;
  clearThroughTomorrow: boolean;
  nextCommitment: string;
  slippingProjectCount: number;
}) {
  const slippingText =
    slippingProjectCount === 0
      ? "Nothing slipping."
      : `${slippingProjectCount} project${slippingProjectCount === 1 ? "" : "s"} slipping.`;

  return (
    <section className="py-9">
      <div className="flex items-start gap-3">
        {clearThroughTomorrow ? (
          <CheckCircle2 className="mt-1 shrink-0 text-teal-700" size={22} />
        ) : null}
        <div className="min-w-0">
          <p className="font-serif text-[27px] font-medium leading-[1.25] tracking-[-0.01em] text-stone-950">
            {clearThroughTomorrow
              ? "Nothing due through tomorrow."
              : `${dueTodayCount} due today.`}
          </p>
          <p className="mt-2 text-[15px] leading-normal text-[#6B7268]">
            {clearThroughTomorrow
              ? `Next commitment: ${nextCommitment}. ${slippingText}`
              : `Next: ${nextCommitment}. ${slippingText}`}
          </p>
          <Link
            href="/today"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-700 underline-offset-4 transition hover:underline"
          >
            Open Today
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function TodayRows({ data }: { data: ReadyToday }) {
  const rows = [
    ...data.todayEvents.map((event) => ({
      id: `event-${event.id}`,
      sort: event.start.getTime(),
      content: (
        <Link
          href="/today"
          className="block py-3 transition hover:text-teal-700"
        >
          <p className="text-[15px] font-medium text-stone-950">
            {event.title}
          </p>
          <p className="mt-0.5 text-[13px] text-[#6B7268]">
            {formatTime(event.start)}
          </p>
        </Link>
      ),
    })),
    ...data.dueToday.map((task) => ({
      id: `task-${task.id}`,
      sort: task.dueTime
        ? Number(new Date(`1970-01-01T${task.dueTime}:00.000Z`))
        : Number.MAX_SAFE_INTEGER,
      content: <TaskReceiptRow task={task} />,
    })),
  ].sort((left, right) => left.sort - right.sort);

  if (rows.length === 0) {
    return <p className="py-3 text-sm text-stone-500">No commitments today.</p>;
  }

  const visibleRows = rows.slice(0, 5);
  const remaining = rows.length - visibleRows.length;

  return (
    <>
      {visibleRows.map((row) => (
        <div key={row.id}>{row.content}</div>
      ))}
      {remaining > 0 ? (
        <Link
          href="/today"
          className="block py-3 text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-teal-700 hover:underline"
        >
          and {remaining} more → Today
        </Link>
      ) : null}
    </>
  );
}

function TaskReceiptRow({ task }: { task: HomeTask }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <Link
        href={`/tasks/${task.id}`}
        className="min-w-0 flex-1 rounded-[10px] transition hover:text-teal-700"
      >
        <p className="text-[15px] font-medium text-stone-950">{task.title}</p>
        <p className="mt-0.5 text-[13px] text-[#6B7268]">
          {[
            task.area.name,
            task.project?.name,
            task.dueDate ? formatDateOnly(task.dueDate) : null,
          ]
            .filter(Boolean)
            .join(" / ")}
        </p>
      </Link>
      <HomeTaskActions taskId={task.id} starred={task.starred} />
    </div>
  );
}

function RoutinesLine({
  routines,
}: {
  routines: ReadyToday["routinesDueToday"];
}) {
  if (routines.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[14px] border border-[#E2E6DF] bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          <Repeat size={16} className="text-teal-700" />
          <span>Routines</span>
        </div>
        {routines.map((routine) =>
          routine.completedToday ? (
            <HomeRoutineCheck
              key={routine.id}
              routineId={routine.id}
              name={routine.name}
              completed
            />
          ) : (
            <HomeRoutineCheck
              key={routine.id}
              routineId={routine.id}
              name={routine.name}
            />
          ),
        )}
      </div>
    </section>
  );
}

function PulseRow({
  freshCheckInCount,
  slippingProjectCount,
  pendingCaptureCount,
  reviewDueCount,
}: {
  freshCheckInCount: number;
  slippingProjectCount: number;
  pendingCaptureCount: number;
  reviewDueCount: number;
}) {
  const items = [
    {
      href: "/projects",
      text: `Projects: ${freshCheckInCount} fresh check-in${freshCheckInCount === 1 ? "" : "s"} · ${slippingProjectCount} slipping → Projects`,
    },
    {
      href: "/areas/area_inbox",
      text: `Inbox: ${pendingCaptureCount} capture${pendingCaptureCount === 1 ? "" : "s"} to sort → Inbox`,
    },
    reviewDueCount > 0
      ? {
          href: "/areas/area_inbox",
          text: `Reviews: ${reviewDueCount} waiting → Inbox`,
        }
      : null,
  ].filter((item): item is { href: string; text: string } => Boolean(item));

  return (
    <section className="flex flex-col gap-2 text-sm text-[#6B7268] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
      {items.map((item) => (
        <Link
          key={item.text}
          href={item.href}
          className="underline-offset-4 transition hover:text-teal-700 hover:underline"
        >
          {item.text}
        </Link>
      ))}
    </section>
  );
}

function RecentCaptures({
  captures,
  domains,
}: {
  captures: ReadyToday["recentCaptures"];
  domains: ReadyToday["domains"];
}) {
  if (captures.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[14px] border border-[#E2E6DF] bg-white px-4 py-3">
      <SectionHeader title="Recently captured" href="/areas/area_inbox" />
      <div className="mt-2 divide-y divide-[#EEF1EC]">
        {captures.slice(0, 5).map((capture) => {
          const pending = isPendingCapture(capture);
          return (
            <div
              key={capture.id}
              className="grid gap-2 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <Link
                href={getCaptureHref(capture)}
                className="truncate text-stone-900 transition hover:text-teal-700"
              >
                {capture.rawText}
              </Link>
              {pending ? (
                <CaptureFileActions
                  captureId={capture.id}
                  domains={domains}
                  align="right"
                />
              ) : (
                <span className="text-xs text-[#9AA096]">
                  {formatCaptureOutcome(capture.createdItems) ??
                    capture.parseStatus ??
                    "saved"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MemoryCard({ item }: { item: ResurfacedItem | null }) {
  if (!item) {
    return null;
  }

  return (
    <Link
      href={item.itemType === "idea" ? "/ideas" : "/ideas"}
      className="block rounded-[14px] border border-[#E2E6DF] bg-white px-4 py-3 transition hover:border-teal-300"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-stone-800">
        <Archive size={16} className="text-teal-700" />
        <h2 className="text-sm font-semibold">
          {item.itemType === "idea"
            ? `An idea from ${formatShortDate(item.itemDate)}`
            : `A journal entry from ${formatDateOnly(item.itemDate)}`}
        </h2>
      </div>
      <p className="line-clamp-4 text-sm leading-6 text-stone-700">
        {item.body}
      </p>
    </Link>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        {title}
      </h2>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-teal-700 hover:underline"
      >
        Open
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function getNextCommitment(data: ReadyToday) {
  const event =
    data.todayEvents[0] ?? data.tomorrowEvents[0] ?? data.nextEvent ?? null;
  if (event) {
    return `${event.title}, ${formatShortDate(event.start)} ${formatTime(event.start)}`;
  }

  const task = data.dueToday[0] ?? data.dueTomorrow[0] ?? data.nextTask ?? null;
  if (task?.dueDate) {
    return `${task.title}, ${formatDateOnly(task.dueDate)}`;
  }

  return "none scheduled";
}

async function getHomeData() {
  try {
    const today = dateOnlyFromString(localDateString());
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      pendingCaptureCount,
      reviewDueCount,
      freshCheckIns,
      activeProjects,
      latestCheckIns,
      taskActivity,
    ] = await Promise.all([
      prisma.capture.count({
        where: { parseStatus: { in: ["ambiguous", "failed"] } },
      }),
      prisma.scheduledReview.count({
        where: {
          OR: [
            { status: "surfaced" },
            { status: "pending", reviewAt: { lte: today } },
            { status: "pending", reviewAt: null },
          ],
        },
      }),
      prisma.checkIn.findMany({
        where: {
          parentType: "project",
          createdAt: { gte: sevenDaysAgo },
        },
        distinct: ["parentId"],
        select: { parentId: true },
      }),
      prisma.project.findMany({
        where: { status: "active" },
        select: {
          id: true,
          status: true,
          slipThresholdDays: true,
          activity: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
        take: 100,
      }),
      prisma.checkIn.findMany({
        where: { parentType: "project" },
        distinct: ["parentId"],
        orderBy: { createdAt: "desc" },
        select: { parentId: true, createdAt: true },
      }),
      prisma.task.groupBy({
        by: ["projectId"],
        where: { projectId: { not: null } },
        _max: { createdAt: true, completedAt: true, updatedAt: true },
      }),
    ]);

    const checkInByProject = new Map(
      latestCheckIns.map((checkIn) => [checkIn.parentId, checkIn.createdAt]),
    );
    const taskActivityByProject = new Map<string, Date>();
    for (const group of taskActivity) {
      if (!group.projectId) continue;
      const latest = [
        group._max.createdAt,
        group._max.completedAt,
        group._max.updatedAt,
      ]
        .filter((date): date is Date => Boolean(date))
        .sort((left, right) => Number(right) - Number(left))[0];
      if (latest) {
        taskActivityByProject.set(group.projectId, latest);
      }
    }

    const slippingProjectCount = activeProjects.filter((project) => {
      const latest =
        [
          project.activity[0]?.createdAt,
          checkInByProject.get(project.id),
          taskActivityByProject.get(project.id),
        ]
          .filter((date): date is Date => Boolean(date))
          .sort((left, right) => Number(right) - Number(left))[0] ?? null;
      return Boolean(projectLastActivityFact(project, latest));
    }).length;

    return {
      ok: true as const,
      pendingCaptureCount,
      reviewDueCount,
      freshCheckInCount: freshCheckIns.length,
      slippingProjectCount,
    };
  } catch {
    return { ok: false as const };
  }
}

type CaptureItem = {
  type: string;
  id: string;
  label: string;
};

function formatCaptureOutcome(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const labels = value
    .filter(isCaptureItem)
    .filter((item) => item.type !== "pending_capture")
    .slice()
    .reverse()
    .map((item) => item.label)
    .filter((label) => !label.startsWith("Saved to Inbox to sort later"));

  if (labels.length > 0) {
    return labels.slice(0, 2).join("; ");
  }

  const pending = value.filter(isCaptureItem).at(-1);
  return pending?.label ?? null;
}

function getCaptureHref(capture: ReadyToday["recentCaptures"][number]) {
  const item = Array.isArray(capture.createdItems)
    ? capture.createdItems.filter(isCaptureItem).at(-1)
    : null;
  if (!item || item.type === "pending_capture") {
    return "/areas/area_inbox";
  }
  if (item.type === "task") return `/tasks/${item.id}`;
  if (item.type === "project") return `/projects/${item.id}`;
  if (item.type === "idea") return "/ideas";
  return `/search?q=${encodeURIComponent(capture.rawText)}`;
}

function isCaptureItem(item: unknown): item is CaptureItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    typeof item.type === "string" &&
    "id" in item &&
    typeof item.id === "string" &&
    "label" in item &&
    typeof item.label === "string"
  );
}

function isPendingCapture(capture: ReadyToday["recentCaptures"][number]) {
  if (capture.parseStatus === "ambiguous" || capture.parseStatus === "failed") {
    return true;
  }
  return Array.isArray(capture.createdItems)
    ? capture.createdItems.some(
        (item) => isCaptureItem(item) && item.type === "pending_capture",
      )
    : false;
}
