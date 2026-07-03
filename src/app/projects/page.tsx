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
import { checkInSnippet, getLatestCheckIns } from "@/lib/checkins";
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
                {group.domain.name}{" "}
                <Link
                  href={`/domains/${group.domain.id}`}
                  className="ml-1 text-xs font-medium text-teal-700 underline-offset-4 hover:underline"
                >
                  Open
                </Link>
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
          {project.milestoneCounts && project.milestoneCounts.total > 0 ? (
            <span>
              {project.milestoneCounts.completed} of{" "}
              {project.milestoneCounts.total} milestones
            </span>
          ) : null}
        </div>

        {slipFact ? <p className="text-sm text-stone-600">{slipFact}</p> : null}

        {project.latestCheckIn ? (
          <p className="text-sm text-stone-700">
            {checkInSnippet(project.latestCheckIn.bodyMd)}{" "}
            <span className="text-stone-500">
              · {formatShortDate(project.latestCheckIn.createdAt)}
            </span>
          </p>
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
  latestCheckIn: { bodyMd: string; createdAt: Date } | null;
  milestoneCounts: { completed: number; total: number } | null;
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
    ...(project.latestCheckIn ? [project.latestCheckIn.createdAt] : []),
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

    const projectIds = projects.map((project) => project.id);
    const [notes, taskActivity, latestCheckIns, milestoneGroups] =
      await Promise.all([
        prisma.entityNote.findMany({
          where: {
            parentType: "project",
            parentId: { in: projectIds },
          },
          orderBy: { createdAt: "desc" },
          take: 160,
        }),
        prisma.task.groupBy({
          by: ["projectId"],
          where: { projectId: { in: projectIds } },
          _max: { createdAt: true, completedAt: true, updatedAt: true },
        }),
        getLatestCheckIns("project", projectIds),
        prisma.milestone.groupBy({
          by: ["projectId", "status"],
          where: { projectId: { in: projectIds } },
          _count: { _all: true },
        }),
      ]);
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
    const milestoneCountsByProject = new Map<
      string,
      { completed: number; total: number }
    >();
    for (const group of milestoneGroups) {
      const counts = milestoneCountsByProject.get(group.projectId) ?? {
        completed: 0,
        total: 0,
      };
      counts.total += group._count._all;
      if (group.status === "completed") {
        counts.completed += group._count._all;
      }
      milestoneCountsByProject.set(group.projectId, counts);
    }
    const projectsWithNotes = projects.map((project) => ({
      ...project,
      notes: notesByProject.get(project.id) ?? [],
      lastTaskActivity: lastTaskActivityByProject.get(project.id) ?? null,
      latestCheckIn: latestCheckIns.get(project.id) ?? null,
      milestoneCounts: milestoneCountsByProject.get(project.id) ?? null,
    }));

    return { ok: true as const, projects: projectsWithNotes };
  } catch {
    return { ok: false as const };
  }
}
