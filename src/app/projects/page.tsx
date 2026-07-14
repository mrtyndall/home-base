import type {
  Area,
  EntityNote,
  Project,
  ProjectActivity,
  Task,
} from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  dateOnlyFromString,
  formatDateOnly,
  formatShortDate,
  localDateString,
} from "@/lib/dates";
import { ProjectOverflowMenu } from "@/components/project-actions";
import { SetupNotice } from "@/components/setup-notice";
import { checkInSnippet, getLatestCheckIns } from "@/lib/checkins";
import { projectLastActivityFact } from "@/lib/slippage";
import { buildAreaTree, type AreaTreeNode } from "@/lib/hierarchy";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadProjects();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { projects, areas } = result;
  const recentProjects = getRecentProjects(projects);

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          Areas
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href="/projects/new"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#D8DDD5] bg-white px-4 text-[13px] font-medium text-stone-700 transition hover:border-teal-700/50 hover:text-teal-700"
          >
            <Plus size={14} />
            New project
          </Link>
          <Link
            href="/areas/new"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-teal-700 px-4 text-[13px] font-medium text-white transition hover:bg-teal-800"
          >
            <Plus size={14} />
            New area
          </Link>
        </div>
      </header>
      <AreaShelves areas={areas} />
      <RecentProjectsRail projects={recentProjects} />
    </div>
  );
}

function AreaShelves({ areas }: { areas: AreaListItem[] }) {
  const areasById = new Map(areas.map((area) => [area.id, area]));
  const tree = buildAreaTree(areas);
  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Areas
      </h2>
      {areas.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[#D8DDD5] bg-white/60 p-6 sm:p-8">
          <h3 className="font-serif text-[22px] font-medium text-stone-950">
            Create your first area
          </h3>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-[#6B7268]">
            Start with an ongoing part of life you want to keep tending.
            Projects can live inside it when they have a finish line.
          </p>
          <Link
            href="/areas/new"
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-teal-700 px-4 text-[13px] font-medium text-white transition hover:bg-teal-800"
          >
            <Plus size={14} />
            New area
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tree.map((node) => (
            <AreaTreeBranch key={node.id} node={node} areasById={areasById} depth={0} />
          ))}
        </div>
      )}
    </section>
  );
}

function AreaTreeBranch({
  node,
  areasById,
  depth,
}: {
  node: AreaTreeNode;
  areasById: Map<string, AreaListItem>;
  depth: number;
}) {
  const area = areasById.get(node.id);
  if (!area) return null;
  const visualDepth = Math.min(depth, 3);

  return (
    <div style={{ paddingInlineStart: `${visualDepth * 12}px` }}>
      <AreaCard area={area} />
      {node.children.length > 0 ? (
        <details open className="group mt-1">
          <summary className="flex h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-[#7B8278] [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition group-open:rotate-90">›</span>
            {node.children.length} subarea{node.children.length === 1 ? "" : "s"}
          </summary>
          <div className="space-y-3 border-l border-[#DDE2DA] pl-1">
            {node.children.map((child) => (
              <AreaTreeBranch key={child.id} node={child} areasById={areasById} depth={depth + 1} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function AreaCard({ area }: { area: AreaListItem }) {
  const headline = getAreaHeadline(area);
  const facts = [
    area.dueTaskCount > 0
      ? `${area.dueTaskCount} due`
      : `${area.openTaskCount} open task${area.openTaskCount === 1 ? "" : "s"}`,
    `${area.activeProjectCount} active project${area.activeProjectCount === 1 ? "" : "s"}`,
    area.starredNoteCount > 0
      ? `${area.starredNoteCount} important note${area.starredNoteCount === 1 ? "" : "s"}`
      : null,
    area.docCount > 0
      ? `${area.docCount} doc${area.docCount === 1 ? "" : "s"}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <Link
      href={`/areas/${area.id}`}
      className="block rounded-[18px] border border-[#E2E6DF] bg-white p-4 shadow-[0_2px_8px_rgba(28,25,23,0.04)] transition hover:border-teal-700/50 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[18px] font-medium leading-[1.25] text-stone-950">
            {area.name}
          </h3>
          <p className="mt-1 text-xs text-[#9AA096]">{facts.join(" · ")}</p>
        </div>
        {headline.tone ? (
          <span className="shrink-0 rounded-full border border-[#DDE2DA] bg-[#F7F9F5] px-2.5 py-1 text-[11px] font-medium text-stone-600">
            {headline.tone}
          </span>
        ) : null}
      </div>

      {headline.body ? (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-stone-700">
          {headline.body}
        </p>
      ) : null}

      {area.recentNote ? (
        <p className="mt-3 line-clamp-2 border-l-2 border-[#DDE2DA] pl-3 text-[13px] italic leading-relaxed text-stone-500">
          {area.recentNote.bodyMd}
        </p>
      ) : null}
    </Link>
  );
}

function RecentProjectsRail({ projects }: { projects: ProjectListItem[] }) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 border-t border-[#DDE2DA] pt-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Recent projects
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
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
            {project.area?.name ?? "No area yet"}
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
  area: Area | null;
  tasks: Array<
    Pick<Task, "title" | "status" | "dueDate" | "completedAt" | "createdAt">
  >;
  activity: Array<Pick<ProjectActivity, "createdAt">>;
  notes: Array<Pick<EntityNote, "bodyMd" | "createdAt">>;
  lastTaskActivity: Date | null;
  latestCheckIn: { bodyMd: string; createdAt: Date } | null;
  milestoneCounts: { completed: number; total: number } | null;
};

type AreaListItem = Area & {
  openTaskCount: number;
  dueTaskCount: number;
  activeProjectCount: number;
  starredNoteCount: number;
  docCount: number;
  latestCheckIn: { bodyMd: string; createdAt: Date } | null;
  recentNote: Pick<EntityNote, "bodyMd" | "createdAt"> | null;
  pendingCaptureCount: number;
  reviewCount: number;
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

function getRecentProjects(projects: ProjectListItem[]) {
  return [...projects]
    .filter(
      (project) => project.status === "active" || project.status === "someday",
    )
    .sort((a, b) => getProjectSortTime(b) - getProjectSortTime(a))
    .slice(0, 6);
}

function getProjectSortTime(project: ProjectListItem) {
  const nextDatedTask = getNextDatedTask(project);
  const dates = [
    project.latestCheckIn?.createdAt,
    getLastTouched(project),
    nextDatedTask?.dueDate,
    project.createdAt,
  ].filter((date): date is Date => Boolean(date));

  return Math.max(...dates.map((date) => Number(date)));
}

function getAreaHeadline(area: AreaListItem) {
  if (area.pendingCaptureCount > 0 || area.reviewCount > 0) {
    return {
      tone: "Inbox",
      body: [
        area.pendingCaptureCount > 0
          ? `${area.pendingCaptureCount} capture${area.pendingCaptureCount === 1 ? "" : "s"} waiting`
          : null,
        area.reviewCount > 0
          ? `${area.reviewCount} review${area.reviewCount === 1 ? "" : "s"} ready`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  if (area.dueTaskCount > 0) {
    return {
      tone: "Today",
      body: `${area.dueTaskCount} dated task${area.dueTaskCount === 1 ? "" : "s"} in view.`,
    };
  }

  if (area.latestCheckIn) {
    return {
      tone: formatShortDate(area.latestCheckIn.createdAt),
      body: checkInSnippet(area.latestCheckIn.bodyMd, 150),
    };
  }

  if (area.currentState) {
    return { tone: "State", body: area.currentState };
  }

  if (area.recentNote) {
    return {
      tone: formatShortDate(area.recentNote.createdAt),
      body: area.recentNote.bodyMd,
    };
  }

  return { tone: null, body: null };
}

async function loadProjects() {
  try {
    const today = dateOnlyFromString(localDateString());
    const [projects, areas] = await Promise.all([
      prisma.project.findMany({
        where: { status: { in: ["active", "someday", "parked"] } },
        include: {
          area: true,
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
      }),
      prisma.area.findMany({
        where: { status: { in: ["active", "parked"] }, isSystem: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);

    const projectIds = projects.map((project) => project.id);
    const areaIds = areas.map((area) => area.id);
    const [
      notes,
      taskActivity,
      latestCheckIns,
      milestoneGroups,
      areaOpenTaskGroups,
      areaActiveProjectGroups,
      areaStarredNoteGroups,
      latestAreaCheckIns,
      areaDueTaskGroups,
      areaNoteRows,
      areaDocGroups,
    ] = await Promise.all([
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
      prisma.task.groupBy({
        by: ["areaId"],
        where: { areaId: { in: areaIds }, status: "open" },
        _count: { _all: true },
      }),
      prisma.project.groupBy({
        by: ["areaId"],
        where: { areaId: { in: areaIds }, status: "active" },
        _count: { _all: true },
      }),
      prisma.entityNote.groupBy({
        by: ["parentId"],
        where: {
          parentType: "area",
          parentId: { in: areaIds },
          starredAt: { not: null },
        },
        _count: { _all: true },
      }),
      getLatestCheckIns("area", areaIds),
      prisma.task.groupBy({
        by: ["areaId"],
        where: {
          areaId: { in: areaIds },
          status: "open",
          dueDate: { lte: today },
        },
        _count: { _all: true },
      }),
      prisma.entityNote.findMany({
        where: { parentType: "area", parentId: { in: areaIds } },
        orderBy: { createdAt: "desc" },
        take: 160,
      }),
      prisma.entityDoc.groupBy({
        by: ["parentId"],
        where: {
          parentType: "area",
          parentId: { in: areaIds },
          status: "active",
        },
        _count: { _all: true },
      }),
    ]);
    const notesByProject = new Map<string, EntityNote[]>();
    for (const note of notes) {
      if (!note.parentId) continue;
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
    const openTasksByArea = new Map(
      areaOpenTaskGroups.flatMap((group) => group.areaId ? [[group.areaId, group._count._all] as const] : []),
    );
    const activeProjectsByArea = new Map(
      areaActiveProjectGroups.map((group) => [group.areaId, group._count._all]),
    );
    const starredNotesByArea = new Map(
      areaStarredNoteGroups.flatMap((group) => group.parentId ? [[group.parentId, group._count._all] as const] : []),
    );
    const dueTasksByArea = new Map(
      areaDueTaskGroups.flatMap((group) => group.areaId ? [[group.areaId, group._count._all] as const] : []),
    );
    const docsByArea = new Map(
      areaDocGroups.map((group) => [group.parentId, group._count._all]),
    );
    const recentNotesByArea = new Map<string, EntityNote>();
    for (const note of areaNoteRows) {
      if (!note.parentId) continue;
      if (!recentNotesByArea.has(note.parentId)) {
        recentNotesByArea.set(note.parentId, note);
      }
    }
    const areasWithFacts = areas.map((area) => ({
        ...area,
        openTaskCount: openTasksByArea.get(area.id) ?? 0,
        dueTaskCount: dueTasksByArea.get(area.id) ?? 0,
        activeProjectCount: activeProjectsByArea.get(area.id) ?? 0,
        starredNoteCount: starredNotesByArea.get(area.id) ?? 0,
        docCount: docsByArea.get(area.id) ?? 0,
        latestCheckIn: latestAreaCheckIns.get(area.id) ?? null,
        recentNote: recentNotesByArea.get(area.id) ?? null,
        pendingCaptureCount: 0,
        reviewCount: 0,
    }));

    return {
      ok: true as const,
      projects: projectsWithNotes,
      areas: areasWithFacts,
    };
  } catch {
    return { ok: false as const };
  }
}
