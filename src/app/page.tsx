import Link from "next/link";
import {
  Archive,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ListTodo,
  Repeat,
} from "lucide-react";
import { SetupNotice } from "@/components/setup-notice";
import {
  HomeRoutineCheck,
  HomeTaskActions,
} from "@/components/home-action-buttons";
import { HomeTodayList } from "@/components/home-today-list";
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
import { getHomeAttentionItems } from "@/lib/home-attention";
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
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          {masthead}
        </h1>
      </header>

      <StatusLine
        dueTodayCount={todayData.dueToday.length}
        clearThroughTomorrow={
          todayData.dueToday.length === 0 &&
          todayData.dueTomorrow.length === 0 &&
          todayData.todayEvents.length === 0 &&
          todayData.tomorrowEvents.length === 0
        }
        nextCommitment={getNextCommitment(todayData)}
        slippingProjectCount={homeData.slippingProjectCount}
      />

      <AttentionSurface
        pendingCaptureCount={homeData.pendingCaptureCount}
        reviewDueCount={homeData.reviewDueCount}
        slippingProjectCount={homeData.slippingProjectCount}
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-[14px] border border-[#E2E6DF] bg-white p-4">
            <SectionHeader title="Today" href="/today" />
            <div className="mt-3">
              <HomeTodayList
                events={todayData.todayEvents.map((event) => ({
                  id: event.id,
                  title: event.title,
                  time: formatTime(event.start),
                }))}
                tasks={todayData.dueToday.map((task) => ({
                  id: task.id,
                  title: task.title,
                  detail: [
                    task.area?.name ?? "Inbox",
                    task.project?.name,
                    task.dueDate ? formatDateOnly(task.dueDate) : null,
                  ]
                    .filter(Boolean)
                    .join(" / "),
                  starred: task.starred,
                }))}
              />
            </div>
          </section>

          <UpcomingCard items={todayData.upcomingCommitments} />
        </div>

        <div className="space-y-5">
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
      </div>

      <MemoryCard item={todayData.resurfacedItem} />
    </div>
  );
}

type ReadyToday = Awaited<ReturnType<typeof getTodayDashboard>> & {
  ready: true;
};

type HomeTask = ReadyToday["dueToday"][number];

function UpcomingCard({
  items,
}: {
  items: ReadyToday["upcomingCommitments"];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[14px] border border-[#E2E6DF] bg-white p-4">
      <SectionHeader title="Upcoming" href="/today" />
      <div className="mt-3 divide-y divide-[#EEF1EC]">
        {items.map((item) => {
          const Icon = item.kind === "event" ? CalendarDays : ListTodo;
          const href =
            item.kind === "event"
              ? `/calendar-events/${item.id}`
              : `/tasks/${item.id}`;
          const date =
            item.kind === "event"
              ? formatShortDate(item.date)
              : formatDateOnly(item.date);
          const time =
            item.kind === "event"
              ? formatTime(item.at)
              : item.time
                ? formatTime(item.at)
                : null;

          return (
            <Link
              key={`${item.kind}-${item.id}`}
              href={href}
              className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <Icon size={17} className="text-teal-700" aria-hidden="true" />
              <span className="min-w-0 truncate text-[15px] font-medium text-stone-950 transition group-hover:text-teal-700">
                {item.title}
              </span>
              <span className="text-right text-[12px] leading-tight text-[#6B7268]">
                <span className="block">{date}</span>
                <span className="block">
                  {item.kind === "event" ? "Event" : "Task"}
                  {time ? ` · ${time}` : ""}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

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
    <section className="py-1 sm:py-2">
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
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-teal-700 underline-offset-4 transition hover:underline"
          >
            Open Today
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
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
            task.area?.name ?? "Inbox",
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

function AttentionSurface({
  slippingProjectCount,
  pendingCaptureCount,
  reviewDueCount,
}: {
  slippingProjectCount: number;
  pendingCaptureCount: number;
  reviewDueCount: number;
}) {
  const items = getHomeAttentionItems({
    pendingCaptureCount,
    reviewDueCount,
    slippingProjectCount,
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[14px] border border-teal-700/25 bg-[#F2FAF7] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-800">
        Needs attention
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <Link
            key={`${item.detail}-${item.label}`}
            href={item.href}
            className="group flex items-center justify-between gap-3 rounded-[10px] border border-teal-700/15 bg-white/75 px-3 py-2 text-sm transition hover:border-teal-700/40 hover:bg-white"
          >
            <span className="font-medium text-stone-950">{item.label}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-[#6B7268] group-hover:text-teal-700">
              {item.detail}
              <ArrowRight size={13} />
            </span>
          </Link>
        ))}
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
      scheduledReviewDueCount,
      captureReviewProposalCount,
      freshCheckIns,
      activeProjects,
      latestCheckIns,
      taskActivity,
    ] = await Promise.all([
      prisma.capture.count({
        where: {
          status: "active",
          parseStatus: { in: ["ambiguous", "failed"] },
          reviewProposals: {
            none: { status: { in: ["pending", "snoozed"] } },
          },
        },
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
      prisma.captureReviewProposal.count({
        where: {
          OR: [
            { status: "pending" },
            { status: "snoozed", snoozedUntil: { lte: new Date() } },
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
      reviewDueCount: scheduledReviewDueCount + captureReviewProposalCount,
      freshCheckInCount: freshCheckIns.length,
      slippingProjectCount,
    };
  } catch {
    return {
      ok: false as const,
      pendingCaptureCount: 0,
      reviewDueCount: 0,
      freshCheckInCount: 0,
      slippingProjectCount: 0,
    };
  }
}
