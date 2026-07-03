import type { Area, Domain, Project } from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createProject } from "@/app/actions";
import { prisma } from "@/lib/db";
import { formatDateOnly } from "@/lib/dates";
import { ParkProjectForm, UnparkProjectButton } from "@/components/project-actions";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadProjects();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { projects, domains } = result;
  const activeProjects = projects.filter((project) => project.status === "active");
  const parkedProjects = projects.filter((project) => project.status === "parked");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Projects</h1>
      </header>
      <CreateProjectForm domains={domains} />
      <ProjectShelf
        title="Active"
        empty="No active projects."
        projects={activeProjects}
        mode="active"
      />
      <ProjectShelf
        title="Parked / Someday"
        empty="No parked projects."
        projects={parkedProjects}
        mode="parked"
      />
    </div>
  );
}

function CreateProjectForm({
  domains,
}: {
  domains: Array<Domain & { areas: Area[] }>;
}) {
  return (
    <form
      action={createProject}
      className="grid gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-sm md:grid-cols-[1fr_12rem_10rem_auto]"
    >
      <input
        name="name"
        required
        placeholder="New project"
        className="h-10 min-w-0 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      <select
        name="areaId"
        required
        className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        defaultValue={domains[0]?.areas[0]?.id ?? ""}
      >
        {domains.map((domain) => (
          <optgroup key={domain.id} label={domain.name}>
            {domain.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <input
        type="date"
        name="targetDate"
        aria-label="Target date"
        className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      <button
        type="submit"
        title="Create project"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800"
      >
        <Plus size={16} />
        Create
      </button>
    </form>
  );
}

function ProjectShelf({
  title,
  empty,
  projects,
  mode,
}: {
  title: string;
  empty: string;
  projects: ProjectListItem[];
  mode: "active" | "parked";
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-stone-800">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
            {empty}
          </div>
        ) : (
          projects.map((project) => (
            <article
              key={project.id}
              className="rounded-lg border border-stone-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/projects/${project.id}`}
                  className="-m-1 min-w-0 flex-1 rounded-md p-1 transition hover:bg-stone-50"
                >
                  <h2 className="font-semibold">{project.name}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {project.area.name} / {project.status}
                    {project.targetDate
                      ? ` / target ${formatDateOnly(project.targetDate)}`
                      : ""}
                  </p>
                </Link>
              </div>
              <Link href={`/projects/${project.id}`} className="block">
                <p className="mt-3 text-sm text-stone-800">
                  {project.currentState}
                </p>
                <p className="mt-3 border-l-2 border-teal-600 pl-3 text-sm text-stone-700">
                  {project.nextStep}
                </p>
              </Link>
              {mode === "active" ? (
                <ParkProjectForm projectId={project.id} />
              ) : (
                <UnparkProjectButton projectId={project.id} />
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

type ProjectListItem = Project & { area: Area };

async function loadProjects() {
  try {
    const [projects, domains] = await Promise.all([
      prisma.project.findMany({
        where: { status: { in: ["active", "parked"] } },
        include: { area: true },
        orderBy: [{ area: { sortOrder: "asc" } }, { createdAt: "desc" }],
        take: 80,
      }),
      prisma.domain.findMany({
        where: { active: true, isSystem: false },
        orderBy: { sortOrder: "asc" },
        include: {
          areas: {
            where: { status: "active" },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
      }),
    ]);

    return { ok: true as const, projects, domains };
  } catch {
    return { ok: false as const };
  }
}
