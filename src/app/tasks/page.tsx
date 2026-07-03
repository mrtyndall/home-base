import { prisma } from "@/lib/db";
import { formatShortDate } from "@/lib/dates";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadTasks();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { tasks } = result;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Tasks</h1>
      </header>
      <section className="space-y-2">
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
            No open tasks.
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white p-4"
            >
              <div>
                <h2 className="font-medium">{task.title}</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {task.domain.name}
                  {task.project ? ` / ${task.project.name}` : ""}
                  {task.dueDate ? ` / ${formatShortDate(task.dueDate)}` : ""}
                </p>
                {task.notes ? (
                  <p className="mt-2 text-sm text-stone-700">{task.notes}</p>
                ) : null}
              </div>
              <TaskCompleteButton taskId={task.id} />
            </div>
          ))
        )}
      </section>
    </div>
  );
}

async function loadTasks() {
  try {
    const tasks = await prisma.task.findMany({
      where: { status: "open" },
      include: { domain: true, project: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 80,
    });

    return { ok: true as const, tasks };
  } catch {
    return { ok: false as const };
  }
}
