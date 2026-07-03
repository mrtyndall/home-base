import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  FolderKanban,
  Inbox,
  Lightbulb,
  ListTodo,
  Settings,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getTodayDashboard } from "@/lib/today";
import { SetupNotice } from "@/components/setup-notice";
import {
  getInboxActionLabel,
  getTasksActionLabel,
  getTodayActionLabel,
} from "@/lib/home-actions";

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

      <section className="grid gap-3 md:grid-cols-2">
        <ActionCard
          href="/today"
          icon={CalendarCheck2}
          label="Today"
          action={getTodayActionLabel(todayTotal)}
          detail={`${todayData.dueToday.length} due today, ${tomorrowTotal} tomorrow`}
          primary
        />
        <ActionCard
          href="/areas/area_inbox"
          icon={Inbox}
          label="Inbox"
          action={getInboxActionLabel(homeData.pendingCaptureCount)}
          detail={homeData.latestPendingCaptureText ?? "Open the catch-all area"}
          primary={homeData.pendingCaptureCount > 0}
        />
        <ActionCard
          href="/tasks"
          icon={ListTodo}
          label="Tasks"
          action={getTasksActionLabel(
            todayData.dueToday.length,
            todayData.dueTomorrow.length,
          )}
          detail={`${homeData.openTaskCount} open, ${homeData.unscheduledTaskCount} unscheduled`}
        />
        <ActionCard
          href="/projects"
          icon={FolderKanban}
          label="Projects"
          action="Review projects"
          detail={`${homeData.somedayProjectCount} someday, ${homeData.parkedProjectCount} parked`}
        />
        <ActionCard
          href="/ideas"
          icon={Lightbulb}
          label="Ideas"
          action="Open ideas"
          detail={homeData.latestIdeaTitle ?? "No active ideas."}
        />
        <ActionCard
          href="/settings"
          icon={Settings}
          label="Settings"
          action="Open settings"
          detail="Connect calendar, Pushover, API access, and MCP"
        />
      </section>
    </div>
  );
}

type ActionCardProps = {
  href: string;
  icon: typeof CalendarCheck2;
  label: string;
  action: string;
  detail: string;
  primary?: boolean;
};

function ActionCard({
  href,
  icon: Icon,
  label,
  action,
  detail,
  primary = false,
}: ActionCardProps) {
  return (
    <Link
      href={href}
      className={`group rounded-lg border p-4 shadow-sm transition hover:border-teal-500 hover:shadow-md ${
        primary
          ? "border-teal-500 bg-teal-50 text-teal-950"
          : "border-stone-200 bg-white text-stone-950"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
            <Icon size={17} />
            <span>{label}</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-normal">{action}</h2>
        </div>
        <ArrowRight
          className="mt-1 shrink-0 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-teal-600"
          size={17}
        />
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-5 text-stone-600">
        {detail}
      </p>
    </Link>
  );
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
      unscheduledTaskCount,
      latestPendingCapture,
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
      prisma.task.count({
        where: { status: "open", dueDate: null, someday: false },
      }),
      prisma.capture.findFirst({
        where: { parseStatus: { in: ["ambiguous", "failed"] } },
        orderBy: { createdAt: "desc" },
      }),
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
      unscheduledTaskCount,
      latestPendingCaptureText: latestPendingCapture?.rawText ?? null,
      latestIdeaTitle: latestIdea?.title ?? null,
    };
  } catch {
    return { ok: false as const };
  }
}
