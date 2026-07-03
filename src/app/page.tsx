import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  FolderKanban,
  Inbox,
  Lightbulb,
  ListTodo,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getTodayDashboard } from "@/lib/today";
import { formatDateOnly, formatShortDate, formatTime } from "@/lib/dates";
import { SetupNotice } from "@/components/setup-notice";

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

  const todayTotal = todayData.todayEvents.length + todayData.dueToday.length;
  const tomorrowTotal =
    todayData.tomorrowEvents.length + todayData.dueTomorrow.length;
  const nextCommitment = getNextCommitment(todayData);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Home Base
        </p>
        <h1 className="text-3xl font-semibold tracking-normal text-stone-950">
          Home
        </h1>
      </header>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-stone-800">
              <CalendarCheck2 size={18} />
              <h2 className="text-lg font-semibold">Today&apos;s shape</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-stone-600">
              {todayTotal === 0
                ? `No calendar events or tasks due today. ${nextCommitment}`
                : `${todayData.todayEvents.length} calendar ${plural(
                    todayData.todayEvents.length,
                    "event",
                  )} and ${todayData.dueToday.length} ${plural(
                    todayData.dueToday.length,
                    "task",
                  )} due today.`}
            </p>
            <p className="text-sm text-stone-500">
              Tomorrow: {tomorrowTotal} dated{" "}
              {plural(tomorrowTotal, "commitment")}.
            </p>
          </div>
          <Link
            href="/today"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-stone-300 bg-stone-50 px-3 text-sm font-medium text-stone-800 transition hover:border-teal-500 hover:text-teal-700"
          >
            Open Today
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <HomeCard
          href="/tasks"
          icon={ListTodo}
          title="Tasks"
          value={`${homeData.openTaskCount} open`}
          detail={`${todayData.dueToday.length} today, ${todayData.dueTomorrow.length} tomorrow`}
        />
        <HomeCard
          href="/projects"
          icon={FolderKanban}
          title="Projects"
          value={`${homeData.activeProjectCount} active`}
          detail={`${homeData.somedayProjectCount} someday, ${homeData.parkedProjectCount} parked`}
        />
        <HomeCard
          href="/ideas"
          icon={Lightbulb}
          title="Ideas"
          value={`${homeData.activeIdeaCount} active`}
          detail={homeData.latestIdeaTitle ?? "No active ideas."}
        />
        <HomeCard
          href="/areas/area_inbox"
          icon={Inbox}
          title="Inbox"
          value={`${homeData.pendingCaptureCount} pending`}
          detail={homeData.latestCaptureText ?? "Nothing waiting in Inbox."}
        />
      </section>

      {homeData.latestCaptureText ? (
        <Link
          href={homeData.latestCaptureHref}
          className="group block rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:border-teal-400 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-stone-900">
                Recent capture
              </h2>
              <p className="mt-1 line-clamp-4 text-sm leading-6 text-stone-600">
                {homeData.latestCaptureText}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-stone-500 transition group-hover:text-teal-700">
              <span>{homeData.latestCaptureAction}</span>
              <ArrowRight size={16} />
            </div>
          </div>
          {homeData.latestCaptureAt ? (
            <p className="mt-3 text-xs text-stone-500">
              {formatShortDate(homeData.latestCaptureAt)}
            </p>
          ) : null}
        </Link>
      ) : null}
    </div>
  );
}

type HomeCardProps = {
  href: string;
  icon: typeof CalendarCheck2;
  title: string;
  value: string;
  detail: string;
};

function HomeCard({ href, icon: Icon, title, value, detail }: HomeCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:border-teal-400 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-stone-800">
            <Icon size={17} />
            <h2 className="text-base font-semibold">{title}</h2>
          </div>
          <p className="text-2xl font-semibold tracking-normal text-stone-950">
            {value}
          </p>
        </div>
        <ArrowRight
          className="mt-1 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-teal-600"
          size={17}
        />
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-5 text-stone-600">
        {detail}
      </p>
    </Link>
  );
}

type ReadyTodayData = Awaited<ReturnType<typeof getTodayDashboard>> & {
  ready: true;
};

function getNextCommitment(data: ReadyTodayData) {
  if (data.nextEvent) {
    return `Next commitment ${formatShortDate(data.nextEvent.start)} at ${formatTime(
      data.nextEvent.start,
    )}.`;
  }

  if (data.nextTask?.dueDate) {
    return `Next task due ${formatDateOnly(data.nextTask.dueDate)}.`;
  }

  return "No upcoming dated commitments.";
}

function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`;
}

async function getHomeData() {
  try {
    const [
      openTaskCount,
      activeProjectCount,
      somedayProjectCount,
      parkedProjectCount,
      activeIdeaCount,
      pendingCaptureCount,
      latestCapture,
      latestIdea,
    ] = await Promise.all([
      prisma.task.count({ where: { status: "open" } }),
      prisma.project.count({ where: { status: "active" } }),
      prisma.project.count({ where: { status: "someday" } }),
      prisma.project.count({ where: { status: "parked" } }),
      prisma.idea.count({ where: { status: { in: ["seed", "developing"] } } }),
      prisma.capture.count({
        where: { parseStatus: { in: ["ambiguous", "failed"] } },
      }),
      prisma.capture.findFirst({ orderBy: { createdAt: "desc" } }),
      prisma.idea.findFirst({
        where: { status: { in: ["seed", "developing"] } },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    return {
      ok: true as const,
      openTaskCount,
      activeProjectCount,
      somedayProjectCount,
      parkedProjectCount,
      activeIdeaCount,
      pendingCaptureCount,
      latestCaptureText: latestCapture?.rawText ?? null,
      latestCaptureAt: latestCapture?.createdAt ?? null,
      latestCaptureHref: latestCapture ? getCaptureHref(latestCapture) : "/search",
      latestCaptureAction: latestCapture
        ? getCaptureAction(latestCapture)
        : "Search captures",
      latestIdeaTitle: latestIdea?.title ?? null,
    };
  } catch {
    return { ok: false as const };
  }
}

type CaptureForHome = {
  rawText: string;
  parseStatus: string | null;
  createdItems: unknown;
};

function getCaptureHref(capture: CaptureForHome) {
  const item = getLatestFiledItem(capture);
  if (!item) return "/areas/area_inbox";
  if (item.type === "task") return `/tasks/${item.id}`;
  if (item.type === "project") return `/projects/${item.id}`;
  if (item.type === "idea") return "/ideas";
  return `/search?q=${encodeURIComponent(capture.rawText)}`;
}

function getCaptureAction(capture: CaptureForHome) {
  const item = getLatestFiledItem(capture);
  if (!item || capture.parseStatus !== "parsed") return "Sort in Inbox";
  if (item.type === "task" || item.type === "project") return "Open item";
  if (item.type === "idea") return "Open Ideas";
  return "Find in Search";
}

function getLatestFiledItem(capture: CaptureForHome) {
  const items = Array.isArray(capture.createdItems) ? capture.createdItems : [];
  const filedItems = items
    .filter(isCreatedItem)
    .filter((item) => item.type !== "pending_capture");
  return filedItems[filedItems.length - 1] ?? null;
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
