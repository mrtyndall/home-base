import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Pencil, Plus } from "lucide-react";
import {
  addProjectTask,
  updateProjectState,
  updateProjectTimeframe,
} from "@/app/actions";
import { ProjectOverflowMenu } from "@/components/project-actions";
import { SetupNotice } from "@/components/setup-notice";
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
    <div className="space-y-5">
      <header className="space-y-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={16} />
          Projects
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-teal-700">
              {project.area.domain.name} / {project.area.name}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">
              {project.name}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {project.status}
              {project.targetDate
                ? ` / target ${formatDateOnly(project.targetDate)}`
                : ""}
            </p>
            {project.currentState?.trim() ? (
              <p className="mt-3 max-w-2xl text-sm text-stone-700">
                {project.currentState}
              </p>
            ) : null}
          </div>
          <ProjectOverflowMenu projectId={project.id} status={project.status} />
        </div>
      </header>

      <details className="rounded-lg border border-stone-200 bg-white p-4" open>
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-stone-700 [&::-webkit-details-marker]:hidden">
          <CalendarDays size={15} />
          Timeframe
        </summary>
        <form
          action={updateProjectTimeframe}
          className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-sm font-medium text-stone-700">
              <span>Target date</span>
              <input
                type="date"
                name="targetDate"
                defaultValue={
                  project.targetDate?.toISOString().slice(0, 10) ?? ""
                }
                className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="flex h-10 items-center gap-2 text-sm font-medium text-stone-700">
              <input
                type="checkbox"
                name="openEnded"
                defaultChecked={!project.targetDate}
                className="h-4 w-4 rounded border-stone-300 text-teal-700"
              />
              Open ended
            </label>
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
          >
            Save timeframe
          </button>
        </form>
      </details>

      <details className="rounded-lg border border-stone-200 bg-white p-4">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-stone-700 [&::-webkit-details-marker]:hidden">
          <Pencil size={15} />
          Edit state
        </summary>
        <form action={updateProjectState} className="mt-4 space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <label className="block text-sm font-medium text-stone-700">
            <span>Current state</span>
            <textarea
              name="currentState"
              rows={5}
              defaultValue={project.currentState ?? ""}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            <span>Next step</span>
            <textarea
              name="nextStep"
              rows={3}
              defaultValue={project.nextStep ?? ""}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
          >
            Save
          </button>
        </form>
      </details>

      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-stone-800">Tasks</h2>
          {project.status === "active" || project.status === "parked" ? (
            <details className="relative">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800 [&::-webkit-details-marker]:hidden">
                <Plus size={16} />
                Add task
              </summary>
              <form
                action={addProjectTask}
                className="absolute right-0 z-10 mt-2 flex w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-md border border-stone-200 bg-white p-2 shadow-lg"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <label className="sr-only" htmlFor="project-task-title">
                  Task title
                </label>
                <input
                  id="project-task-title"
                  name="title"
                  required
                  className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
                <button
                  type="submit"
                  title="Add task"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-700 text-white transition hover:bg-teal-800"
                >
                  <Plus size={16} />
                </button>
              </form>
            </details>
          ) : null}
        </div>
        {project.tasks.length === 0 ? (
          <p className="text-sm text-stone-500">No open tasks.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {project.tasks.map((task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="block py-2 text-sm font-medium text-stone-800 transition hover:text-teal-700"
              >
                {task.title}
              </Link>
            ))}
          </div>
        )}
      </section>

      {project.milestones.length > 0 ? (
        <MilestonesPanel
          projectId={project.id}
          milestones={project.milestones}
        />
      ) : null}

      <EntityDepth
        parentType="project"
        parentId={project.id}
        notes={project.notes}
        docs={project.docs}
        attachments={project.attachments}
      />

      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-800">Activity</h2>
        {project.activity.length === 0 ? (
          <p className="text-sm text-stone-500">No activity.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {project.activity.map((entry) => (
              <div key={entry.id} className="py-2">
                <p className="text-sm text-stone-800">{entry.entry}</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {formatShortDate(entry.createdAt)}
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

    const [notes, docs, attachments] = project
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
        ])
      : [[], [], []];

    return {
      ok: true as const,
      project: project ? { ...project, notes, docs, attachments } : null,
    };
  } catch {
    return { ok: false as const };
  }
}
