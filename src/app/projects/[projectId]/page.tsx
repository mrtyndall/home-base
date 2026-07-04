import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Plus } from "lucide-react";
import { addProjectTask, updateProjectTimeframe } from "@/app/actions";
import { ProjectOverflowMenu } from "@/components/project-actions";
import { SetupNotice } from "@/components/setup-notice";
import { CheckInFeed } from "@/components/check-in-feed";
import { EntityDepth, MilestonesPanel } from "@/components/entity-depth";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type ProjectDetailPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { projectId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadProject(projectId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.project) {
    notFound();
  }

  const { project } = result;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          Projects
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              <Link
                href={`/domains/${project.area.domain.id}`}
                className="transition hover:text-teal-700"
              >
                {project.area.domain.name}
              </Link>
              {" / "}
              <Link
                href={`/areas/${project.area.id}`}
                className="transition hover:text-teal-700"
              >
                {project.area.name}
              </Link>
            </p>
            <h1 className="mt-1.5 font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950">
              {project.name}
            </h1>
            <p className="mt-1.5 text-[13px] text-stone-500">
              {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
              {project.targetDate
                ? ` · target ${formatDateOnly(project.targetDate)}`
                : ""}
              {project.milestones.length > 0
                ? ` · ${
                    project.milestones.filter(
                      (milestone) => milestone.status === "completed",
                    ).length
                  } of ${project.milestones.length} milestones`
                : ""}
            </p>
          </div>
          <ProjectOverflowMenu projectId={project.id} status={project.status} />
        </div>
      </header>

      <EntityDepth
        parentType="project"
        parentId={project.id}
        notes={project.notes}
        docs={project.docs}
        attachments={project.attachments}
      />

      <MilestonesPanel projectId={project.id} milestones={project.milestones} />

      <details className="relative">
        <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
          <CalendarDays size={13} />
          Timeframe
        </summary>
        <form
          action={updateProjectTimeframe}
          className="mt-2.5 grid gap-3 rounded-[14px] border border-[#E2E6DF] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-[13px] font-medium text-stone-600">
              <span>Target date</span>
              <input
                type="date"
                name="targetDate"
                defaultValue={
                  project.targetDate?.toISOString().slice(0, 10) ?? ""
                }
                className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
              />
            </label>
            <label className="flex h-10 items-center gap-2 text-[13px] font-medium text-stone-600">
              <input
                type="checkbox"
                name="openEnded"
                defaultChecked={!project.targetDate}
                className="h-4 w-4 rounded border-[#E2E6DF] text-teal-700"
              />
              Open ended
            </label>
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
          >
            Save timeframe
          </button>
        </form>
      </details>

      <CheckInFeed
        parentType="project"
        parentId={project.id}
        checkIns={project.checkIns}
      />

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Tasks{" "}
            {project.tasks.length > 0 ? (
              <span className="font-medium text-[#B0ACA2]">
                {project.tasks.length}
              </span>
            ) : null}
          </h2>
          {project.status === "active" || project.status === "parked" ? (
            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
                <Plus size={13} />
                Add task
              </summary>
              <form
                action={addProjectTask}
                className="absolute right-0 z-10 mt-2 flex w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-[20px] border border-white/65 bg-[#FAFBF9]/75 p-2 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <label className="sr-only" htmlFor="project-task-title">
                  Task title
                </label>
                <input
                  id="project-task-title"
                  name="title"
                  required
                  className="h-10 min-w-0 flex-1 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
                />
                <button
                  type="submit"
                  title="Add task"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800"
                >
                  <Plus size={16} />
                </button>
              </form>
            </details>
          ) : null}
        </div>
        {project.tasks.length === 0 ? null : (
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {project.tasks.map((task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="block px-4 py-3 text-sm font-medium text-stone-900 transition hover:bg-[#F7F9F5]"
              >
                {task.title}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Activity
        </h2>
        {project.activity.length === 0 ? null : (
          <div className="divide-y divide-[#EEF1EC]">
            {project.activity.map((entry) => (
              <div key={entry.id} className="py-2">
                <p className="text-[13px] text-stone-600">
                  {entry.entry}{" "}
                  <span className="text-[#B0ACA2]">
                    {formatShortDate(entry.createdAt)}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function loadProject(projectId: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        area: { include: { domain: true } },
        tasks: {
          where: { status: "open" },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          take: 20,
        },
        activity: {
          orderBy: { createdAt: "desc" },
          take: 12,
        },
        milestones: {
          orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
        },
      },
    });

    const [notes, docs, attachments, checkIns] = project
      ? await Promise.all([
          prisma.entityNote.findMany({
            where: { parentType: "project", parentId: project.id },
            orderBy: { createdAt: "desc" },
            take: 12,
          }),
          prisma.entityDoc.findMany({
            where: { parentType: "project", parentId: project.id, status: "active" },
            orderBy: { updatedAt: "desc" },
            take: 12,
          }),
          prisma.document.findMany({
            where: { parentType: "project", parentId: project.id },
            orderBy: { createdAt: "desc" },
            take: 12,
          }),
          prisma.checkIn.findMany({
            where: { parentType: "project", parentId: project.id },
            orderBy: { createdAt: "desc" },
            take: 15,
          }),
        ])
      : [[], [], [], []];

    return {
      ok: true as const,
      project: project ? { ...project, notes, docs, attachments, checkIns } : null,
    };
  } catch {
    return { ok: false as const };
  }
}
