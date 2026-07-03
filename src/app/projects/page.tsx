import type { Domain, Project } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatShortDate } from "@/lib/dates";
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

  const { projects } = result;
  const activeProjects = projects.filter((project) => project.status === "active");
  const parkedProjects = projects.filter((project) => project.status === "parked");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Projects</h1>
      </header>
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
                <div>
                  <h2 className="font-semibold">{project.name}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {project.domain.name} / {project.status}
                    {project.targetDate
                      ? ` / target ${formatShortDate(project.targetDate)}`
                      : ""}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-stone-800">
                {project.currentState}
              </p>
              <p className="mt-3 border-l-2 border-teal-600 pl-3 text-sm text-stone-700">
                {project.nextStep}
              </p>
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

type ProjectListItem = Project & { domain: Domain };

async function loadProjects() {
  try {
    const projects = await prisma.project.findMany({
      where: { status: { in: ["active", "parked"] } },
      include: { domain: true },
      orderBy: [{ domain: { sortOrder: "asc" } }, { createdAt: "desc" }],
      take: 80,
    });

    return { ok: true as const, projects };
  } catch {
    return { ok: false as const };
  }
}
