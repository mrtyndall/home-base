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
  const activeProjects = projects.filter(
    (project) => project.status === "active",
  );
  const somedayProjects = projects.filter(
    (project) => project.status === "someday",
  );
  const parkedProjects = projects.filter(
    (project) => project.status === "parked",
  );

  return (
    <div className="space-y-7">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          Projects
        </h1>
        <Link
          href="/projects/new"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-teal-700 px-4 text-[13px] font-medium text-white transition hover:bg-teal-800"
        >
          <Plus size={14} />
          New project
        </Link>
      </header>
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
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        {title}{" "}
        <span className="font-medium text-[#B0ACA2]">{projects.length}</span>
      </h2>
      {projects.length === 0 ? (
        <p className="text-sm text-[#6B7268]">{empty}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
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
  const settled = project.status !== "active";

  return (
    <article
      className={`rounded-[14px] border border-[#E2E6DF] p-4 ${
        settled ? "bg-white/55" : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/projects/${project.id}`}
          className="-m-1 min-w-0 flex-1 rounded-[10px] p-1 transition hover:bg-[#F7F9F5]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            {project.area.name}
          </p>
          <h2
            className={`mt-1 text-[17px] font-medium leading-[1.3] ${
              settled ? "text-stone-700" : "text-stone-950"
            }`}
          >
            {project.name}
          </h2>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href={`/domains/${project.area.domain.id}`}
            className="inline-flex h-6 items-center rounded-full border border-[#E2E6DF] bg-white px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
          >
            {project.area.domain.name}
          </Link>
          <ProjectOverflowMenu projectId={project.id} status={project.status} />
        </div>
      </div>
      <Link href={`/projects/${project.id}`} className="mt-2.5 block space-y-2">
        {nextDatedTask?.dueDate ? (
          <p className="text-sm text-stone-700">
            <span className="text-[#9AA096]">Next:</span> {nextDatedTask.title}{" "}
            · {formatDateOnly(nextDatedTask.dueDate)}
          </p>
        ) : openTasks.length > 0 ? (
          <p className="text-sm text-stone-700">
            <span className="text-[#9AA096]">Next:</span> {openTasks.length}{" "}
            open task{openTasks.length === 1 ? "" : "s"}
          </p>
        ) : null}

        {project.latestCheckIn ? (
          <p className="text-sm leading-relaxed text-stone-800">
            {checkInSnippet(project.latestCheckIn.bodyMd)}{" "}
            <span className="text-[#9AA096]">
              · {formatShortDate(project.latestCheckIn.createdAt)}
            </span>
          </p>
        ) : null}

        {slipFact ? (
          <p className="text-[13px] text-stone-600">{slipFact}</p>
        ) : null}

        {freshNote ? (
          <p className="text-[13px] italic text-stone-500">{freshNote}</p>
        ) : null}

        {(lastTouched && !slipFact) ||
        project.targetDate ||
        (project.milestoneCounts && project.milestoneCounts.total > 0) ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#9AA096]">
            {lastTouched && !slipFact ? (
              <span>Touched {formatShortDate(lastTouched)}</span>
            ) : null}
            {project.targetDate ? (
              <span>Target {formatDateOnly(project.targetDate)}</span>
            ) : null}
            {project.milestoneCounts && project.milestoneCounts.total > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                {project.milestoneCounts.completed} of{" "}
                {project.milestoneCounts.total} milestones
                {project.milestoneCounts.total <= 8 ? (
                  <span className="inline-flex gap-[3px]" aria-hidden="true">
                    {Array.from({ length: project.milestoneCounts.total }).map(
                      (_, index) => (
                        <span
                          key={index}
                          className={`h-[3px] w-[13px] rounded-full ${
                            index < (project.milestoneCounts?.completed ?? 0)
                              ? "bg-teal-700"
                              : "bg-[#E2E6DF]"
                          }`}
                        />
                      ),
                    )}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}
      </Link>
    </article>
  );
}

type ProjectListItem = Project & {
  area: Area & { domain: Domain };
  tasks: Array<
    Pick<Task, "title" | "status" | "dueDate" | "completedAt" | "createdAt">
  >;
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
  return note.bodyMd.length > 140
    ? `${note.bodyMd.slice(0, 137)}...`
    : note.bodyMd;
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
