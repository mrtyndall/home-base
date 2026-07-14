import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { addSubtask, updateTaskDetail } from "@/app/actions";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { TaskQuickAssignment } from "@/components/task-quick-assignment";
import { TaskStarButton } from "@/components/task-star-button";
import { SetupNotice } from "@/components/setup-notice";
import { formatDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatRecurrenceRule } from "@/lib/recurrence";
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

  const { task, domains, projects, assignmentProjects } = result;
  const reminderOffsets = parseReminderOffsets(task.reminderOffsets).join(", ");
  const parsedReminderOffsets = parseReminderOffsets(task.reminderOffsets);
  const labelsText = task.tags.join(", ");
  const facts: Array<[string, string]> = [];
  if (task.dueDate) {
    facts.push([
      "Due",
      `${formatDateOnly(task.dueDate)}${task.dueTime ? ` · ${formatDueTime(task.dueTime)}` : ""}`,
    ]);
  } else if (task.dueTime) {
    facts.push(["Due", formatDueTime(task.dueTime)]);
  }
  if (task.someday) {
    facts.push(["Scheduled", "Someday"]);
  }
  if (task.priority) {
    facts.push([
      "Priority",
      task.priority.charAt(0).toUpperCase() + task.priority.slice(1),
    ]);
  }
  if (parsedReminderOffsets.length > 0) {
    facts.push([
      "Reminders",
      parsedReminderOffsets.map(humanizeReminderOffset).join(" · "),
    ]);
  }
  if (task.recurrenceRule) {
    facts.push(["Repeats", formatRecurrenceRule(task.recurrenceRule)]);
  }
  if (task.status === "completed" && task.completedAt) {
    facts.push(["Completed", formatDateOnly(task.completedAt)]);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-3.5">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          Tasks
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              {task.area?.name ?? "Inbox"}
              {task.project ? ` / ${task.project.name}` : ""}
            </p>
            <h1 className="mt-1.5 font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950">
              {task.title}
            </h1>
          </div>
          {task.status === "open" ? (
            <div className="flex shrink-0 items-center gap-1.5 pt-1">
              <TaskStarButton taskId={task.id} starred={task.starred} />
              <TaskCompleteButton taskId={task.id} />
            </div>
          ) : null}
        </div>
      </header>

      {task.status === "open" && !task.areaId && !task.projectId ? (
        <TaskQuickAssignment
          taskId={task.id}
          areas={domains.map(({ id, name }) => ({ id, name }))}
          projects={assignmentProjects.map(({ id, name, areaId, area }) => ({
            id,
            name,
            areaId,
            areaName: area.name,
          }))}
        />
      ) : null}

      {facts.length > 0 ? (
        <section className="rounded-[14px] border border-[#E2E6DF] bg-white px-4">
          <dl className="divide-y divide-[#EEF1EC]">
            {facts.map(([label, value]) => (
              <div key={label} className="flex gap-4 py-2.5">
                <dt className="min-w-[88px] pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
                  {label}
                </dt>
                <dd className="text-[15px] text-stone-950">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {task.notes || task.tags.length > 0 ? (
        <section className="space-y-3">
          {task.notes ? (
            <div className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
                Description
              </h2>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">
                {task.notes}
              </p>
            </div>
          ) : null}
          {task.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-8 items-center rounded-full border border-[#DDE5DD] bg-[#F7FAF5] px-3 text-[13px] font-medium text-stone-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Subtasks{" "}
          {task.subtasks.length > 0 ? (
            <span className="font-medium text-[#B0ACA2]">
              {task.subtasks.length}
            </span>
          ) : null}
        </h2>
        {task.subtasks.length > 0 ? (
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {task.subtasks.map((subtask) => (
              <div
                key={subtask.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <Link
                  href={`/tasks/${subtask.id}`}
                  className="-m-1 min-w-0 flex-1 rounded-[10px] p-1 transition hover:bg-[#F7F9F5]"
                >
                  <p className="text-sm font-medium text-stone-900">
                    {subtask.title}
                  </p>
                  {subtask.dueDate ? (
                    <p className="mt-0.5 text-xs text-[#9AA096]">
                      {formatDateOnly(subtask.dueDate)}
                    </p>
                  ) : null}
                </Link>
                <TaskCompleteButton taskId={subtask.id} />
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-start gap-x-2.5 gap-y-2.5">
          <AddSubtaskForm parentTaskId={task.id} />
          <details className="min-w-0 open:basis-full">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center px-2 text-[13px] font-medium text-stone-500 transition hover:text-stone-950 [&::-webkit-details-marker]:hidden">
              Edit
            </summary>
            <form
              action={updateTaskDetail}
              className="mt-2.5 space-y-4 rounded-[14px] border border-[#E2E6DF] bg-white p-4"
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
                <Field label="Labels">
                  <input
                    name="labels"
                    defaultValue={labelsText}
                    className={inputClassName}
                  />
                </Field>
                <Field label="Area">
                  <select
                    name="areaId"
                    defaultValue={task.areaId ?? ""}
                    className={inputClassName}
                  >
                    <option value="">Inbox</option>
                    {domains.map((area) => (
                      <option key={area.id} value={area.id}>{area.name}</option>
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
                    className={inputClassName}
                  />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  name="notes"
                  defaultValue={task.notes ?? ""}
                  rows={5}
                  className={`${inputClassName} h-auto rounded-[14px] py-2`}
                />
              </Field>

              <Field label="Repeats">
                <select
                  name="recurrenceRule"
                  defaultValue={task.recurrenceRule ?? ""}
                  className={inputClassName}
                >
                  <option value="">Does not repeat</option>
                  <option value="FREQ=DAILY">Daily</option>
                  <option value="FREQ=WEEKLY">Weekly</option>
                  <option value="FREQ=MONTHLY">Monthly</option>
                  <option value="FREQ=YEARLY">Yearly</option>
                  {task.recurrenceRule &&
                  !["FREQ=DAILY", "FREQ=WEEKLY", "FREQ=MONTHLY", "FREQ=YEARLY"].includes(
                    task.recurrenceRule,
                  ) ? (
                    <option value={task.recurrenceRule}>
                      {formatRecurrenceRule(task.recurrenceRule)}
                    </option>
                  ) : null}
                </select>
              </Field>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
                >
                  Save detail
                </button>
              </div>
            </form>
          </details>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[13px] font-medium text-stone-600">
      <span>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function AddSubtaskForm({ parentTaskId }: { parentTaskId: string }) {
  return (
    <details>
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
        <Plus size={13} />
        Add subtask
      </summary>
      <form action={addSubtask} className="mt-2.5 flex gap-2">
        <input type="hidden" name="parentTaskId" value={parentTaskId} />
        <input
          name="title"
          aria-label="Subtask title"
          className="h-10 min-w-0 flex-1 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
        />
        <button
          type="submit"
          title="Add subtask"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800"
        >
          <Plus size={16} />
        </button>
      </form>
    </details>
  );
}

function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function formatDueTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;
  const hours = Number(match[1]);
  if (hours > 23) return time;
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]}${suffix}`;
}

function humanizeReminderOffset(offset: number) {
  if (offset >= 24 * 60 && offset % (24 * 60) === 0) {
    const days = offset / (24 * 60);
    return `${days} day${days === 1 ? "" : "s"} before`;
  }
  if (offset >= 60 && offset % 60 === 0) {
    const hours = offset / 60;
    return `${hours} hour${hours === 1 ? "" : "s"} before`;
  }
  return `${offset} minute${offset === 1 ? "" : "s"} before`;
}

async function loadTaskDetail(taskId: string) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        area: true,
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

    const [domains, projects, assignmentProjects] = await Promise.all([
      prisma.area.findMany({
        where: { status: "active", isSystem: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      task.areaId ? prisma.project.findMany({
        where: {
          areaId: task.areaId,
          status: { in: ["active", "parked", "someday"] },
        },
        orderBy: { name: "asc" },
      }) : Promise.resolve([]),
      !task.areaId && !task.projectId
        ? prisma.project.findMany({
            where: {
              status: { in: ["active", "parked", "someday"] },
              area: { is: { status: "active", isSystem: false } },
            },
            select: {
              id: true,
              name: true,
              areaId: true,
              area: { select: { name: true } },
            },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
    ]);

    return { ok: true as const, task, domains, projects, assignmentProjects };
  } catch {
    return {
      ok: false as const,
      task: null,
      domains: [],
      projects: [],
      assignmentProjects: [],
    };
  }
}

const inputClassName =
  "h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-teal-700";
