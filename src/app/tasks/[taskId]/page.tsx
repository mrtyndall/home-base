import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { addSubtask, updateTaskDetail } from "@/app/actions";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { SetupNotice } from "@/components/setup-notice";
import { formatDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { parseReminderOffsets } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type TaskDetailPageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { taskId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadTaskDetail(taskId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.task) {
    notFound();
  }

  const { task, domains, projects } = result;
  const reminderOffsets = parseReminderOffsets(task.reminderOffsets).join(", ");

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={16} />
          Tasks
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-teal-700">
              Task detail
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">
              {task.title}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {task.domain.name}
              {task.project ? ` / ${task.project.name}` : ""}
              {task.dueDate ? ` / ${formatDateOnly(task.dueDate)}` : ""}
            </p>
          </div>
          {task.status === "open" ? <TaskCompleteButton taskId={task.id} /> : null}
        </div>
      </header>

      <form
        action={updateTaskDetail}
        className="space-y-4 rounded-lg border border-stone-200 bg-white p-4"
      >
        <input type="hidden" name="taskId" value={task.id} />

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Due date">
            <input
              type="date"
              name="dueDate"
              defaultValue={dateInputValue(task.dueDate)}
              className={inputClassName}
            />
          </Field>
          <Field label="Due time">
            <input
              type="time"
              name="dueTime"
              defaultValue={task.dueTime ?? ""}
              className={inputClassName}
            />
          </Field>
          <Field label="Priority">
            <select
              name="priority"
              defaultValue={task.priority ?? ""}
              className={inputClassName}
            >
              <option value="">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
          <Field label="Domain">
            <select
              name="domainId"
              defaultValue={task.domainId}
              className={inputClassName}
            >
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select
              name="projectId"
              defaultValue={task.projectId ?? ""}
              className={inputClassName}
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reminder offsets">
            <input
              name="reminderOffsets"
              defaultValue={reminderOffsets}
              placeholder="15, 60, 1440"
              className={inputClassName}
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            name="notes"
            defaultValue={task.notes ?? ""}
            rows={5}
            className={`${inputClassName} h-auto py-2`}
          />
        </Field>

        <Field label="RRULE">
          <input
            name="recurrenceRule"
            defaultValue={task.recurrenceRule ?? ""}
            placeholder="FREQ=WEEKLY;INTERVAL=1"
            className={inputClassName}
          />
        </Field>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
          >
            Save detail
          </button>
        </div>
      </form>

      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-800">Subtasks</h2>
        {task.subtasks.length === 0 ? (
          <p className="text-sm text-stone-500">No open subtasks.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {task.subtasks.map((subtask) => (
              <div
                key={subtask.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <Link
                  href={`/tasks/${subtask.id}`}
                  className="-m-1 min-w-0 flex-1 rounded-md p-1 transition hover:bg-stone-50"
                >
                  <p className="text-sm font-medium text-stone-800">
                    {subtask.title}
                  </p>
                  {subtask.dueDate ? (
                    <p className="mt-0.5 text-xs text-stone-500">
                      {formatDateOnly(subtask.dueDate)}
                    </p>
                  ) : null}
                </Link>
                <TaskCompleteButton taskId={subtask.id} />
              </div>
            ))}
          </div>
        )}
        <AddSubtaskForm parentTaskId={task.id} />
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function AddSubtaskForm({ parentTaskId }: { parentTaskId: string }) {
  return (
    <form action={addSubtask} className="flex gap-2 border-t border-stone-100 pt-3">
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

function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

async function loadTaskDetail(taskId: string) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        domain: true,
        project: true,
        subtasks: {
          where: { status: "open" },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!task) {
      return { ok: true as const, task: null };
    }

    const [domains, projects] = await Promise.all([
      prisma.domain.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.project.findMany({
        where: {
          domainId: task.domainId,
          status: { in: ["active", "parked"] },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    return { ok: true as const, task, domains, projects };
  } catch {
    return { ok: false as const };
  }
}

const inputClassName =
  "h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
