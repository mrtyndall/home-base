import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Plus } from "lucide-react";
import { addProjectTask, updateProjectArea, updateProjectTimeframe } from "@/app/actions";
import { AreaPicker } from "@/components/area-picker";
import { ProjectOverflowMenu } from "@/components/project-actions";
import { SetupNotice } from "@/components/setup-notice";
import { CheckInFeed } from "@/components/check-in-feed";
import {
  EntityAttachmentAction,
  EntityDepth,
  EntityDocAction,
  MilestonesPanel,
} from "@/components/entity-depth";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { TaskStarButton } from "@/components/task-star-button";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadReferenceMentions } from "@/lib/reference-mentions";
import { formatRecurrenceRule } from "@/lib/recurrence";
import { flattenAreaOptions } from "@/lib/hierarchy";

export const dynamic = "force-dynamic";

type ProjectDetailPageProps = {
  params: Promise<{ projectId: string }>;
};

type LoadedProject = NonNullable<
  Extract<Awaited<ReturnType<typeof loadProject>>, { ok: true }>["project"]
>;

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
  const completedMilestones = project.milestones.filter(
    (milestone) => milestone.status === "completed",
  ).length;
  const milestoneTotal = project.milestones.length;
  const latestCheckIn = project.checkIns[0] ?? null;
  const projectPath = project.areaId
    ? flattenAreaOptions(project.allAreas).find((option) => option.id === project.areaId)?.path ?? project.area?.name
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-3 border-b border-[#DDE2DA] pb-5">
        <nav aria-label="Project path" className="flex min-h-11 min-w-0 flex-wrap items-center gap-1.5 text-sm text-stone-500">
          <Link href="/projects" className="inline-flex h-11 items-center gap-2 font-medium transition hover:text-stone-950"><ArrowLeft size={15} />Areas</Link>
          <span aria-hidden="true" className="text-[#B0B6AD]">/</span>
          {project.area ? <Link href={`/areas/${project.area.id}`} className="min-w-0 break-words py-2 [overflow-wrap:anywhere] transition hover:text-teal-700">{projectPath}</Link> : <span className="py-2">No area yet</span>}
          <span aria-hidden="true" className="text-[#B0B6AD]">/</span>
          <span aria-current="page" className="min-w-0 break-words py-2 text-stone-700 [overflow-wrap:anywhere]">{project.name}</span>
        </nav>
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096] [overflow-wrap:anywhere]">
              {projectPath ?? "No area yet"} · Project
            </p>
            <h1 className="mt-1.5 break-words font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950 [overflow-wrap:anywhere] lg:text-[32px]">
              {project.name}
            </h1>
            {latestCheckIn ? (
              <p className="mt-2 hidden max-w-2xl text-base leading-relaxed text-stone-700 lg:block">
                {projectContextSnippet(latestCheckIn.bodyMd)}{" "}
                <span className="text-[#9AA096]">
                  - latest check-in, {formatShortDate(latestCheckIn.createdAt)}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="mt-1.5 flex flex-wrap items-center justify-end gap-2 text-right text-[13px] text-stone-500">
              <span>
                {project.status.charAt(0).toUpperCase() +
                  project.status.slice(1)}
              </span>
              {project.targetDate ? (
                <span>Target {formatDateOnly(project.targetDate)}</span>
              ) : null}
              {milestoneTotal > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  {completedMilestones} of {milestoneTotal} milestones
                  <MilestoneTicks
                    completed={completedMilestones}
                    total={milestoneTotal}
                  />
                </span>
              ) : null}
            </div>
            <ProjectOverflowMenu
              projectId={project.id}
              status={project.status}
            />
          </div>
        </div>
      </header>

      <details className="rounded-[14px] border border-[#E2E6DF] bg-white">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3.5 text-[13px] font-medium text-stone-600 [&::-webkit-details-marker]:hidden">
          Project area <span className="text-[#9AA096]">{projectPath ?? "No area yet"}</span>
        </summary>
        <form action={updateProjectArea} className="space-y-3 border-t border-[#EEF1EC] p-3.5">
          <input type="hidden" name="projectId" value={project.id} />
          <AreaPicker areas={project.allAreas} defaultAreaId={project.areaId} />
          <div className="flex justify-end"><button type="submit" className="h-11 rounded-full bg-teal-700 px-5 text-sm font-medium text-white transition hover:bg-teal-800">Save area</button></div>
        </form>
      </details>

      <CheckInFeed
        parentType="project"
        parentId={project.id}
        checkIns={project.checkIns}
      />

      <div className="lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-8">
        <div className="space-y-6">
          <MilestonesPanel
            projectId={project.id}
            milestones={project.milestones}
          />
          <EntityDepth
            parentType="project"
            parentId={project.id}
            notes={project.notes}
            docs={project.docs}
            attachments={project.attachments}
            variant="project"
          />
        </div>
        <div className="mt-6 space-y-6 lg:mt-0">
          <ProjectTasksSection project={project} />
          <div className="flex flex-wrap items-start gap-2">
            <TimeframeEditor project={project} />
            {project.docs.length === 0 ? (
              <EntityDocAction parentType="project" parentId={project.id} />
            ) : null}
            {project.attachments.length === 0 ? (
              <EntityAttachmentAction
                parentType="project"
                parentId={project.id}
              />
            ) : null}
          </div>
          <ActivityLog activity={project.activity} />
        </div>
      </div>
    </div>
  );
}

function ProjectTasksSection({ project }: { project: LoadedProject }) {
  return (
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
        <div className="space-y-2">
          {project.tasks.map((task) => (
            <article
              key={task.id}
              className="flex items-start justify-between gap-3 rounded-[14px] border border-[#E2E6DF] bg-white p-4 transition hover:border-teal-700/35 hover:bg-[#F7F9F5]"
            >
              <Link
                href={`/tasks/${task.id}`}
                className="-m-1 min-w-0 flex-1 rounded-[10px] p-1 transition hover:bg-[#F7F9F5] hover:text-teal-700"
              >
                <p className="text-sm font-medium text-stone-900">
                  {task.title}
                </p>
                <p className="mt-0.5 text-xs text-[#6B7268]">
                  {[
                    project.area?.name ?? "No area yet",
                    task.dueDate ? formatDateOnly(task.dueDate) : null,
                    task.recurrenceRule
                      ? formatRecurrenceRule(task.recurrenceRule)
                      : null,
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join(" / ")}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <TaskStarButton taskId={task.id} starred={task.starred} />
                <TaskCompleteButton taskId={task.id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TimeframeEditor({ project }: { project: LoadedProject }) {
  return (
    <details className="relative">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 px-1 text-[13px] font-medium text-stone-500 transition hover:text-stone-950 [&::-webkit-details-marker]:hidden">
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
  );
}

function ActivityLog({ activity }: { activity: LoadedProject["activity"] }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Activity
      </h2>
      {activity.length === 0 ? null : (
        <div className="divide-y divide-[#EEF1EC]">
          {activity.map((entry) => (
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
  );
}

function MilestoneTicks({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  if (total > 8) return null;
  return (
    <span className="inline-flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          className={`h-[3px] w-[13px] rounded-full ${
            index < completed ? "bg-teal-700" : "bg-[#E2E6DF]"
          }`}
        />
      ))}
    </span>
  );
}

function projectContextSnippet(body: string) {
  return body.length > 150 ? `${body.slice(0, 147)}...` : body;
}

async function loadProject(projectId: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        area: true,
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

    const [notes, docs, attachments, checkIns, allAreas] = project
      ? await Promise.all([
          prisma.entityNote.findMany({
            where: { parentType: "project", parentId: project.id },
            orderBy: { createdAt: "desc" },
            take: 80,
          }),
          prisma.entityDoc.findMany({
            where: {
              parentType: "project",
              parentId: project.id,
              status: "active",
            },
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
          prisma.area.findMany({
            where: { status: "active", isSystem: false },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          }),
        ])
      : [[], [], [], [], []];

    const noteMentions =
      project && notes.length > 0
        ? await loadReferenceMentions(
            "entity_note",
            notes.map((note) => note.id),
          )
        : new Map();

    return {
      ok: true as const,
      project: project
        ? {
            ...project,
            notes: notes.map((note) => ({
              ...note,
              mentions: noteMentions.get(note.id) ?? [],
            })),
            docs,
            attachments,
            checkIns,
            allAreas,
          }
        : null,
    };
  } catch {
    return { ok: false as const, project: null };
  }
}
