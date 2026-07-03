import type { Domain, Project, Task } from "@prisma/client";
import { Plus } from "lucide-react";
import { addSubtask } from "@/app/actions";
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
            <article
              key={task.id}
              className="rounded-lg border border-stone-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{task.title}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {task.domain.name}
                    {task.project ? ` / ${task.project.name}` : ""}
                    {task.dueDate ? ` / ${formatShortDate(task.dueDate)}` : ""}
                    {task.recurrenceRule ? " / repeats" : ""}
                  </p>
                  {task.notes ? (
                    <p className="mt-2 text-sm text-stone-700">{task.notes}</p>
                  ) : null}
                </div>
                <TaskCompleteButton taskId={task.id} />
              </div>
              <SubtaskList subtasks={task.subtasks} />
              <AddSubtaskForm parentTaskId={task.id} />
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function SubtaskList({ subtasks }: { subtasks: TaskListItem["subtasks"] }) {
  if (subtasks.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 divide-y divide-stone-100 border-t border-stone-100 pt-2">
      {subtasks.map((subtask) => (
        <div key={subtask.id} className="flex items-center justify-between gap-3 py-2">
          <div>
            <p className="text-sm font-medium text-stone-800">{subtask.title}</p>
            {subtask.dueDate ? (
              <p className="mt-0.5 text-xs text-stone-500">
                {formatShortDate(subtask.dueDate)}
              </p>
            ) : null}
          </div>
          <TaskCompleteButton taskId={subtask.id} />
        </div>
      ))}
    </div>
  );
}

function AddSubtaskForm({ parentTaskId }: { parentTaskId: string }) {
  return (
    <form action={addSubtask} className="mt-3 flex gap-2 border-t border-stone-100 pt-3">
      <input type="hidden" name="parentTaskId" value={parentTaskId} />
      <input
        name="title"
        placeholder="Add subtask"
        className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      <button
        type="submit"
        title="Add subtask"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-stone-300 bg-white text-stone-600 transition hover:border-teal-500 hover:text-teal-700"
      >
        <Plus size={16} />
      </button>
    </form>
  );
}

type TaskListItem = Task & {
  domain: Domain;
  project: Project | null;
  subtasks: Task[];
};

async function loadTasks() {
  try {
    const tasks = await prisma.task.findMany({
      where: { status: "open", parentTaskId: null },
      include: {
        domain: true,
        project: true,
        subtasks: {
          where: { status: "open" },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 80,
    });

    return { ok: true as const, tasks };
  } catch {
    return { ok: false as const };
  }
}
