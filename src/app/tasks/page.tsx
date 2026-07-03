import type { Area, Domain, Project, Task } from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { addSubtask } from "@/app/actions";
import { prisma } from "@/lib/db";
import { addDaysToDateString, formatDateOnly, localDateString } from "@/lib/dates";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { DraggableTaskLink, TaskDropZone } from "@/components/task-scheduling";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

type TasksPageProps = {
  searchParams: Promise<{ domain?: string }>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const { domain } = await searchParams;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadTasks();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { tasks, projects, domains } = result;
  const selectedDomainId = domains.some((item) => item.id === domain) ? domain : "";
  const visibleTasks = selectedDomainId
    ? tasks.filter((task) => task.area.domainId === selectedDomainId)
    : tasks;
  const today = localDateString();
  const tomorrow = addDaysToDateString(today, 1);
  const sections = groupTasks(visibleTasks, today, tomorrow);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Tasks</h1>
      </header>
      <TaskQuickAdd
        areaGroups={domains.map((domain) => ({
          domainName: domain.name,
          areas: domain.areas.map((area) => ({ id: area.id, name: area.name })),
        }))}
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          areaId: project.areaId,
          areaName: project.area.name,
        }))}
      />
      <DomainFilter domains={domains} selectedDomainId={selectedDomainId} />
      <TaskSection
        title="Today"
        empty="No tasks due today."
        targetDate={today}
        tasks={sections.today}
        today={today}
        tomorrow={tomorrow}
      />
      <TaskSection
        title="Tomorrow"
        empty="No tasks due tomorrow."
        targetDate={tomorrow}
        tasks={sections.tomorrow}
        today={today}
        tomorrow={tomorrow}
      />
      <UpcomingSection
        groups={sections.upcoming}
        today={today}
        tomorrow={tomorrow}
      />
      <TaskSection
        title="Someday"
        empty="No someday tasks."
        targetDate={null}
        tasks={sections.someday}
        today={today}
        tomorrow={tomorrow}
      />
      <TaskSection
        title="No date"
        empty="No undated tasks."
        targetDate={null}
        tasks={sections.noDate}
        today={today}
        tomorrow={tomorrow}
      />
    </div>
  );
}

function DomainFilter({
  domains,
  selectedDomainId,
}: {
  domains: Array<Domain & { areas: Area[] }>;
  selectedDomainId: string | undefined;
}) {
  const visibleDomains = domains.filter((domain) => !domain.isSystem);
  return (
    <nav className="flex flex-wrap gap-2">
      <Link
        href="/tasks"
        className={`rounded-md border px-3 py-1.5 text-sm transition ${
          !selectedDomainId
            ? "border-teal-600 bg-teal-50 text-teal-800"
            : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
        }`}
      >
        All
      </Link>
      {visibleDomains.map((domain) => (
        <Link
          key={domain.id}
          href={`/tasks?domain=${domain.id}`}
          className={`rounded-md border px-3 py-1.5 text-sm transition ${
            selectedDomainId === domain.id
              ? "border-teal-600 bg-teal-50 text-teal-800"
              : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
          }`}
        >
          {domain.name}
        </Link>
      ))}
    </nav>
  );
}

function TaskSection({
  title,
  empty,
  targetDate,
  tasks,
  today,
  tomorrow,
}: {
  title: string;
  empty: string;
  targetDate: string | null;
  tasks: TaskListItem[];
  today: string;
  tomorrow: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-stone-800">{title}</h2>
      <TaskDropZone
        targetDate={targetDate}
        isEmpty={tasks.length === 0}
        emptyText={empty}
      >
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              today={today}
              tomorrow={tomorrow}
            />
          ))}
        </div>
      </TaskDropZone>
    </section>
  );
}

function UpcomingSection({
  groups,
  today,
  tomorrow,
}: {
  groups: Array<{ date: string; tasks: TaskListItem[] }>;
  today: string;
  tomorrow: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-stone-800">Upcoming</h2>
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
          No upcoming dated tasks.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.date} className="space-y-2">
              <h3 className="text-sm font-medium text-stone-600">
                {formatDateOnly(group.date)}
              </h3>
              <TaskDropZone
                targetDate={group.date}
                isEmpty={group.tasks.length === 0}
                emptyText={`No tasks on ${formatDateOnly(group.date)}.`}
              >
                <div className="space-y-2">
                  {group.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      today={today}
                      tomorrow={tomorrow}
                    />
                  ))}
                </div>
              </TaskDropZone>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TaskCard({
  task,
  today,
  tomorrow,
}: {
  task: TaskListItem;
  today: string;
  tomorrow: string;
}) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <DraggableTaskLink
          taskId={task.id}
          href={`/tasks/${task.id}`}
          title={task.title}
          detail={formatTaskDetail(task)}
          currentDueDate={task.dueDate?.toISOString().slice(0, 10) ?? null}
          today={today}
          tomorrow={tomorrow}
        />
        <TaskCompleteButton taskId={task.id} />
      </div>
      <SubtaskList subtasks={task.subtasks} today={today} tomorrow={tomorrow} />
      <AddSubtaskForm parentTaskId={task.id} />
    </article>
  );
}

function SubtaskList({
  subtasks,
  today,
  tomorrow,
}: {
  subtasks: TaskListItem["subtasks"];
  today: string;
  tomorrow: string;
}) {
  if (subtasks.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 divide-y divide-stone-100 border-t border-stone-100 pt-2">
      {subtasks.map((subtask) => (
        <div key={subtask.id} className="flex items-center justify-between gap-3 py-2">
          <DraggableTaskLink
            taskId={subtask.id}
            href={`/tasks/${subtask.id}`}
            title={subtask.title}
            detail={subtask.dueDate ? formatDateOnly(subtask.dueDate) : "Subtask"}
            currentDueDate={subtask.dueDate?.toISOString().slice(0, 10) ?? null}
            today={today}
            tomorrow={tomorrow}
          />
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
  area: Area & { domain: Domain };
  project: Project | null;
  subtasks: Task[];
};

function formatTaskDetail(task: TaskListItem) {
  return [
    task.area.domain.name,
    task.area.name,
    task.project?.name,
    task.dueDate ? formatDateOnly(task.dueDate) : null,
    task.recurrenceRule ? "repeats" : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join(" / ");
}

function groupTasks(tasks: TaskListItem[], today: string, tomorrow: string) {
  const todayTasks: TaskListItem[] = [];
  const tomorrowTasks: TaskListItem[] = [];
  const somedayTasks: TaskListItem[] = [];
  const noDate: TaskListItem[] = [];
  const upcomingByDate = new Map<string, TaskListItem[]>();

  for (const task of tasks) {
    if (task.someday) {
      somedayTasks.push(task);
      continue;
    }

    const dueDate = task.dueDate?.toISOString().slice(0, 10) ?? null;
    if (!dueDate) {
      noDate.push(task);
      continue;
    }

    if (dueDate <= today) {
      todayTasks.push(task);
      continue;
    }

    if (dueDate === tomorrow) {
      tomorrowTasks.push(task);
      continue;
    }

    const group = upcomingByDate.get(dueDate) ?? [];
    group.push(task);
    upcomingByDate.set(dueDate, group);
  }

  return {
    today: todayTasks,
    tomorrow: tomorrowTasks,
    someday: somedayTasks,
    upcoming: Array.from(upcomingByDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, groupedTasks]) => ({ date, tasks: groupedTasks })),
    noDate,
  };
}

async function loadTasks() {
  try {
    const [tasks, projects, domains] = await Promise.all([
      prisma.task.findMany({
        where: { status: "open", parentTaskId: null },
        include: {
          area: { include: { domain: true } },
          project: true,
          subtasks: {
            where: { status: "open" },
            orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 80,
      }),
      prisma.project.findMany({
        where: { status: { in: ["active", "parked", "someday"] } },
        include: { area: { include: { domain: true } } },
        orderBy: [{ area: { sortOrder: "asc" } }, { name: "asc" }],
      }),
      prisma.domain.findMany({
        where: {
          OR: [{ active: true, isSystem: false }, { isSystem: true }],
        },
        include: {
          areas: {
            where: { status: "active" },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    return { ok: true as const, tasks, projects, domains };
  } catch {
    return { ok: false as const };
  }
}
