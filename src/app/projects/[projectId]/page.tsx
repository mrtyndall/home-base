import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { addProjectTask, updateProjectState } from "@/app/actions";
import {
  ActivateProjectButton,
  CompleteProjectButton,
  KillProjectButton,
  ParkProjectForm,
  UnparkProjectButton,
} from "@/components/project-actions";
import { SetupNotice } from "@/components/setup-notice";
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
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-teal-700">
            Project
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {project.area.domain.name} / {project.area.name} / {project.status}
            {project.targetDate
              ? ` / target ${formatDateOnly(project.targetDate)}`
              : ""}
          </p>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <form
          action={updateProjectState}
          className="space-y-4 rounded-lg border border-stone-200 bg-white p-4"
        >
          <input type="hidden" name="projectId" value={project.id} />
          <label className="block text-sm font-medium text-stone-700">
            <span>Current state</span>
            <textarea
              name="currentState"
              required
              rows={5}
              defaultValue={project.currentState}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            <span>Next step</span>
            <textarea
              name="nextStep"
              required
              rows={3}
              defaultValue={project.nextStep}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
            >
              Save state
            </button>
          </div>
        </form>

        <aside className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-base font-semibold text-stone-800">Status</h2>
          {project.status === "active" ? (
            <>
              <ParkProjectForm projectId={project.id} />
              <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                <CompleteProjectButton projectId={project.id} />
                <KillProjectButton projectId={project.id} />
              </div>
            </>
          ) : project.status === "parked" ? (
            <UnparkProjectButton projectId={project.id} />
          ) : project.status === "someday" ? (
            <ActivateProjectButton projectId={project.id} />
          ) : (
            <p className="text-sm text-stone-600">
              This project remains searchable with its full history.
            </p>
          )}
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-base font-semibold text-stone-800">Open tasks</h2>
          {project.status === "active" || project.status === "parked" ? (
            <form action={addProjectTask} className="flex gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <input
                name="title"
                required
                placeholder="Add task to project"
                className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
              <button
                type="submit"
                title="Add task to project"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-700 text-white transition hover:bg-teal-800"
              >
                <Plus size={16} />
              </button>
            </form>
          ) : null}
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
        </div>

        <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-base font-semibold text-stone-800">Activity</h2>
          {project.activity.length === 0 ? (
            <p className="text-sm text-stone-500">No activity yet.</p>
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
        </div>
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
      },
    });

    return { ok: true as const, project };
  } catch {
    return { ok: false as const };
  }
}
