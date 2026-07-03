import { prisma } from "@/lib/db";
import { formatShortDate } from "@/lib/dates";
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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Projects</h1>
      </header>
      <section className="grid gap-3 md:grid-cols-2">
        {projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
            No active or parked projects.
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
            </article>
          ))
        )}
      </section>
    </div>
  );
}

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
