import type {
  Area,
  Domain,
  EntityNote,
  Project,
  ProjectActivity,
  Task,
} from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import { ProjectOverflowMenu } from "@/components/project-actions";
import { SetupNotice } from "@/components/setup-notice";
import { projectLastActivityFact } from "@/lib/slippage";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadProjects();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { projects } = result;
  const activeProjects = projects.filter((project) => project.status === "active");
  const somedayProjects = projects.filter((project) => project.status === "someday");
  const parkedProjects = projects.filter((project) => project.status === "parked");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Projects</h1>
      </header>
      <Link
        href="/projects/new"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800"
      >
        <Plus size={16} />
        New project
      </Link>
      <ProjectShelf
        title="Active"
        empty="No active projects."
        projects={activeProjects}
      />
      <ProjectShelf
        title="Someday"
        empty="No someday projects."
        projects={somedayProjects}
      />
      <ProjectShelf
        title="Parked"
        empty="No parked projects."
        projects={parkedProjects}
      />
    </div>
  );
}

function ProjectShelf({
  title,
  empty,
  projects,
}: {
  title: string;
  empty: string;
  projects: ProjectListItem[];
}) {
  const groups = groupProjectsByDomain(projects);
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-stone-800">
        {title} <span className="font-normal text-stone-500">{projects.length}</span>
      </h2>
      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
          {empty}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <details key={group.domain.id} open className="space-y-2">
              <summary className="cursor-pointer list-none text-sm font-semibold text-stone-700 [&::-webkit-details-marker]:hidden">
                {group.domain.name}
              </summary>
              <div className="grid gap-3 md:grid-cols-2">
                {group.projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectCard({ project }: { project: ProjectListItem }) {
  const openTasks = project.tasks.filter((task) => task.status === "open");
  const nextDatedTask = getNextDatedTask(project);
  const lastTouched = getLastTouched(project);
  const freshNote = getFreshNote(project);
  const slipFact = projectLastActivityFact(project, lastTouched);

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/projects/${project.id}`}
          className="-m-1 min-w-0 flex-1 rounded-md p-1 transition hover:bg-stone-50"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
            {project.area.domain.name} / {project.area.name}
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-snug">
            {project.name}
          </h2>
        </Link>
        <ProjectOverflowMenu projectId={project.id} status={project.status} />
      </div>
      <Link href={`/projects/${project.id}`} className="mt-3 block space-y-3">
        {nextDatedTask?.dueDate ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
              Next dated task
            </p>
            <p className="mt-1 text-sm font-medium text-stone-900">
              {nextDatedTask.title}
            </p>
            <p className="mt-0.5 text-sm text-stone-500">
              {formatDateOnly(nextDatedTask.dueDate)}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
              Open tasks
            </p>
            <p className="mt-1 text-sm font-medium text-stone-900">
              {openTasks.length}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
          {lastTouched && !slipFact ? (
            <span>Touched {formatShortDate(lastTouched)}</span>
          ) : null}
          {project.targetDate ? (
            <span>Target {formatDateOnly(project.targetDate)}</span>
          ) : null}
        </div>

        {slipFact ? <p className="text-sm text-stone-600">{slipFact}</p> : null}

        {project.currentState?.trim() ? (
          <p className="text-sm text-stone-700">{project.currentState}</p>
        ) : null}
        {freshNote ? (
          <p className="border-l-2 border-stone-200 pl-3 text-sm text-stone-600">
            {freshNote}
          </p>
        ) : null}
      </Link>
    </article>
  );
}

type ProjectListItem = Project & {
  area: Area & { domain: Domain };
  tasks: Array<Pick<Task, "title" | "status" | "dueDate" | "completedAt" | "createdAt">>;
  activity: Array<Pick<ProjectActivity, "createdAt">>;
  notes: Array<Pick<EntityNote, "bodyMd" | "createdAt">>;
  lastTaskActivity: Date | null;
};

function getNextDatedTask(project: ProjectListItem) {
  const openTasks = project.tasks.filter((task) => task.status === "open");
  return openTasks
    .filter((task) => task.dueDate)
    .sort((a, b) => Number(a.dueDate) - Number(b.dueDate))[0];
}

function getLastTouched(project: ProjectListItem) {
  const dates = [
    ...(project.lastTaskActivity ? [project.lastTaskActivity] : []),
    ...project.activity.map((entry) => entry.createdAt),
    ...project.notes.map((note) => note.createdAt),
  ];

  return dates.sort((a, b) => Number(b) - Number(a))[0] ?? null;
}

function getFreshNote(project: ProjectListItem) {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const note = project.notes.find((item) => Number(item.createdAt) >= cutoff);
  if (!note) return null;
  return note.bodyMd.length > 140 ? `${note.bodyMd.slice(0, 137)}...` : note.bodyMd;
}

function groupProjectsByDomain(projects: ProjectListItem[]) {
  const groups = new Map<string, { domain: Domain; projects: ProjectListItem[] }>();
  for (const project of projects) {
    const existing = groups.get(project.area.domain.id) ?? {
      domain: project.area.domain,
      projects: [],
    };
    existing.projects.push(project);
    groups.set(project.area.domain.id, existing);
  }

  return Array.from(groups.values()).sort((left, right) =>
    left.domain.sortOrder === right.domain.sortOrder
      ? left.domain.name.localeCompare(right.domain.name)
      : left.domain.sortOrder - right.domain.sortOrder,
  );
}

async function loadProjects() {
  try {
    const projects = await prisma.project.findMany({
      where: { status: { in: ["active", "someday", "parked"] } },
      include: {
        area: { include: { domain: true } },
        tasks: {
          where: { status: { in: ["open", "completed"] } },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          take: 60,
        },
        activity: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: [{ area: { sortOrder: "asc" } }, { createdAt: "desc" }],
      take: 80,
    });

    const [notes, taskActivity] = projects.length
      ? await Promise.all([
          prisma.entityNote.findMany({
            where: {
              parentType: "project",
              parentId: { in: projects.map((project) => project.id) },
            },
            orderBy: { createdAt: "desc" },
            take: 160,
          }),
          prisma.task.groupBy({
            by: ["projectId"],
            where: { projectId: { in: projects.map((project) => project.id) } },
            _max: { createdAt: true, completedAt: true, updatedAt: true },
          }),
        ])
      : [[], []];
    const notesByProject = new Map<string, EntityNote[]>();
    for (const note of notes) {
      const group = notesByProject.get(note.parentId) ?? [];
      group.push(note);
      notesByProject.set(note.parentId, group);
    }
    const lastTaskActivityByProject = new Map<string, Date>();
    for (const group of taskActivity) {
      if (!group.projectId) continue;
      const latest = [
        group._max.createdAt,
        group._max.completedAt,
        group._max.updatedAt,
      ]
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => Number(b) - Number(a))[0];
      if (latest) {
        lastTaskActivityByProject.set(group.projectId, latest);
      }
    }
    const projectsWithNotes = projects.map((project) => ({
      ...project,
      notes: notesByProject.get(project.id) ?? [],
      lastTaskActivity: lastTaskActivityByProject.get(project.id) ?? null,
    }));

    return { ok: true as const, projects: projectsWithNotes };
  } catch {
    return { ok: false as const };
  }
}
