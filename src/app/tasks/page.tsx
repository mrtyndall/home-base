import type { Area, Domain, Project, Task } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  addDaysToDateString,
  formatDateOnly,
  localDateString,
} from "@/lib/dates";
import { TaskCompleteButton } from "@/components/task-complete-button";
import { TaskStarButton } from "@/components/task-star-button";
import { DraggableTaskLink, TaskDropZone } from "@/components/task-scheduling";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { RoutinesView } from "@/components/routines-view";
import { SetupNotice } from "@/components/setup-notice";
import { getRoutinesWithState } from "@/lib/routines";
import { getTaskSlipDays, taskOpenSinceFact } from "@/lib/slippage";
import { buildTaskSectionJumps } from "@/lib/task-section-jumps";
import {
  buildTasksFilterHref,
  normalizeFilterValues,
  normalizeStarredFilter,
  normalizeTaskSection,
  normalizeTaskView,
  toggleFilterValue,
  type TaskSectionFilter,
  type TaskViewFilter,
} from "@/lib/task-filter-links";

export const dynamic = "force-dynamic";

type TasksPageProps = {
  searchParams: Promise<{
    domain?: string | string[];
    project?: string | string[];
    section?: string | string[];
    starred?: string | string[];
    view?: string | string[];
    projectSearch?: string | string[];
  }>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const { domain, project, section, starred, view, projectSearch } =
    await searchParams;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const selectedView = normalizeTaskView(view);
  const result = await loadTasks(selectedView);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { tasks, doneTasks, openCount, doneCount, projects, domains } = result;
  const slipDays = await getTaskSlipDays();
  const routines =
    selectedView === "routines" ? await getRoutinesWithState() : [];
  const selectedDomainIds = normalizeFilterValues(
    domain,
    domains.map((item) => item.id),
  );
  const allowedProjectIds = projects
    .filter(
      (item) =>
        selectedDomainIds.length === 0 ||
        selectedDomainIds.includes(item.area.domainId),
    )
    .map((item) => item.id);
  const selectedProjectIds = normalizeFilterValues(project, allowedProjectIds);
  const selectedSection = normalizeTaskSection(section);
  const starredOnly = normalizeStarredFilter(starred);
  const projectSearchText = Array.isArray(projectSearch)
    ? (projectSearch[0] ?? "")
    : (projectSearch ?? "");
  const filtersActive =
    selectedDomainIds.length > 0 ||
    selectedProjectIds.length > 0 ||
    starredOnly;
  const visibleTasks = tasks.filter((task) => {
    if (
      selectedDomainIds.length > 0 &&
      !selectedDomainIds.includes(task.area.domainId)
    ) {
      return false;
    }
    if (
      selectedProjectIds.length > 0 &&
      (!task.projectId || !selectedProjectIds.includes(task.projectId))
    ) {
      return false;
    }
    if (starredOnly && !task.starred) {
      return false;
    }
    return true;
  });
  const visibleDoneTasks = doneTasks.filter((task) => {
    if (
      selectedDomainIds.length > 0 &&
      !selectedDomainIds.includes(task.area.domainId)
    ) {
      return false;
    }
    if (
      selectedProjectIds.length > 0 &&
      (!task.projectId || !selectedProjectIds.includes(task.projectId))
    ) {
      return false;
    }
    if (starredOnly && !task.starred) {
      return false;
    }
    return true;
  });
  const today = localDateString();
  const tomorrow = addDaysToDateString(today, 1);
  const sections = groupTasks(visibleTasks, today, tomorrow);
  const areaGroups = domains.map((domain) => ({
    domainName: domain.name,
    areas: domain.areas.map((area) => ({ id: area.id, name: area.name })),
  }));
  const projectOptions = projects.map((project) => ({
    id: project.id,
    name: project.name,
    areaId: project.areaId,
    areaName: project.area.name,
  }));

  return (
    <div className="space-y-5">
      <header className="space-y-3 lg:flex lg:items-start lg:justify-between lg:gap-5 lg:space-y-0">
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          Tasks
        </h1>
        <TaskQuickAdd
          areaGroups={areaGroups}
          projects={projectOptions}
          className="lg:w-[400px] lg:shrink-0"
        />
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <ViewControl
          selectedView={selectedView}
          selectedDomainIds={selectedDomainIds}
          selectedProjectIds={selectedProjectIds}
          selectedSection={selectedSection}
          starredOnly={starredOnly}
        />
        <TaskFilters
          domains={domains}
          projects={projects}
          selectedDomainIds={selectedDomainIds}
          selectedProjectIds={selectedProjectIds}
          projectSearch={projectSearchText}
          selectedSection={selectedSection}
          starredOnly={starredOnly}
          view={selectedView}
        />
        {selectedView === "schedule" ? (
          <SectionJumps
            className="lg:ml-auto"
            selectedDomainIds={selectedDomainIds}
            selectedProjectIds={selectedProjectIds}
            selectedSection={selectedSection}
            starredOnly={starredOnly}
            todayCount={sections.today.length}
            tomorrowCount={sections.tomorrow.length}
            upcomingCount={sections.upcoming.reduce(
              (total, group) => total + group.tasks.length,
              0,
            )}
            somedayCount={sections.someday.length}
            unscheduledCount={sections.noDate.length}
          />
        ) : null}
      </div>
      {selectedView === "open" || selectedView === "all" ? (
        <AllOpenSection
          tasks={visibleTasks}
          today={today}
          tomorrow={tomorrow}
          areaGroups={areaGroups}
          projects={projectOptions}
          slipDays={slipDays}
          totalCount={filtersActive ? null : openCount}
        />
      ) : null}
      {selectedView === "done" || selectedView === "all" ? (
        <DoneSection
          tasks={visibleDoneTasks}
          totalCount={filtersActive ? null : doneCount}
        />
      ) : null}
      {selectedView === "routines" ? (
        <RoutinesView routines={routines} />
      ) : null}
      {selectedView === "schedule" ? (
        <div className="grid gap-7 lg:grid-cols-2">
          {selectedSection === "all" || selectedSection === "today" ? (
            <TaskSection
              title="Today"
              empty="No tasks due today."
              anchor="today"
              targetDate={today}
              tasks={sections.today}
              today={today}
              tomorrow={tomorrow}
              areaGroups={areaGroups}
              projects={projectOptions}
              slipDays={slipDays}
            />
          ) : null}
          {selectedSection === "all" || selectedSection === "tomorrow" ? (
            <TaskSection
              title="Tomorrow"
              empty="No tasks due tomorrow."
              anchor="tomorrow"
              targetDate={tomorrow}
              tasks={sections.tomorrow}
              today={today}
              tomorrow={tomorrow}
              areaGroups={areaGroups}
              projects={projectOptions}
              slipDays={slipDays}
            />
          ) : null}
        </div>
      ) : null}
      {selectedView === "schedule" &&
      (selectedSection === "all" || selectedSection === "upcoming") ? (
        <UpcomingSection
          groups={sections.upcoming}
          today={today}
          tomorrow={tomorrow}
          areaGroups={areaGroups}
          projects={projectOptions}
          slipDays={slipDays}
        />
      ) : null}
      {selectedView === "schedule" &&
      (selectedSection === "all" || selectedSection === "someday") ? (
        <TaskSection
          title="Someday"
          empty="No someday tasks."
          anchor="someday"
          targetDate={null}
          tasks={sections.someday}
          today={today}
          tomorrow={tomorrow}
          areaGroups={areaGroups}
          projects={projectOptions}
          slipDays={slipDays}
        />
      ) : null}
      {selectedView === "schedule" &&
      (selectedSection === "all" || selectedSection === "unscheduled") ? (
        <TaskSection
          title="Unscheduled"
          empty="No unscheduled tasks."
          anchor="unscheduled"
          targetDate={null}
          tasks={sections.noDate}
          today={today}
          tomorrow={tomorrow}
          areaGroups={areaGroups}
          projects={projectOptions}
          slipDays={slipDays}
        />
      ) : null}
    </div>
  );
}

function SectionJumps({
  className = "",
  selectedDomainIds,
  selectedProjectIds,
  selectedSection,
  starredOnly,
  todayCount,
  tomorrowCount,
  upcomingCount,
  somedayCount,
  unscheduledCount,
}: {
  className?: string;
  selectedDomainIds: string[];
  selectedProjectIds: string[];
  selectedSection: TaskSectionFilter;
  starredOnly: boolean;
  todayCount: number;
  tomorrowCount: number;
  upcomingCount: number;
  somedayCount: number;
  unscheduledCount: number;
}) {
  const links = buildTaskSectionJumps({
    todayCount,
    tomorrowCount,
    upcomingCount,
    somedayCount,
    unscheduledCount,
  });
  const totalCount =
    todayCount +
    tomorrowCount +
    upcomingCount +
    somedayCount +
    unscheduledCount;
  const allLink = {
    href: buildTasksFilterHref({
      domains: selectedDomainIds,
      projects: selectedProjectIds,
      section: "all",
      starred: starredOnly,
    }),
    label: "All",
    count: totalCount,
    hasItems: totalCount > 0,
    active: selectedSection === "all",
  };

  return (
    <nav
      aria-label="Task sections"
      className={`flex flex-wrap items-baseline gap-x-4 gap-y-1.5 text-sm ${className}`}
    >
      {[allLink, ...links].map((item) => {
        const { href, label, count, hasItems } = item;
        const sectionValue = href.replace("#", "") as TaskSectionFilter;
        const filterHref = href.startsWith("#")
          ? buildTasksFilterHref({
              domains: selectedDomainIds,
              projects: selectedProjectIds,
              section: sectionValue,
              starred: starredOnly,
            })
          : href;
        const isActive =
          "active" in item ? item.active : selectedSection === sectionValue;
        return (
          <Link
            key={label}
            href={filterHref}
            className={`inline-flex items-baseline gap-1 transition ${
              isActive
                ? "font-medium text-teal-800"
                : hasItems
                  ? "text-stone-700 hover:text-teal-700"
                  : "text-stone-400 hover:text-stone-600"
            }`}
          >
            {label}
            <span
              className={`text-xs tabular-nums ${
                isActive ? "text-teal-700" : "text-[#9AA096]"
              }`}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function ViewControl({
  selectedView,
  selectedDomainIds,
  selectedProjectIds,
  selectedSection,
  starredOnly,
}: {
  selectedView: TaskViewFilter;
  selectedDomainIds: string[];
  selectedProjectIds: string[];
  selectedSection: TaskSectionFilter;
  starredOnly: boolean;
}) {
  const views: Array<{ value: TaskViewFilter; label: string }> = [
    { value: "schedule", label: "Schedule" },
    { value: "open", label: "All Open" },
    { value: "done", label: "Done" },
    { value: "all", label: "All" },
    { value: "routines", label: "Routines" },
  ];

  return (
    <nav
      aria-label="Task views"
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-[#E2E6DF] bg-white p-1"
    >
      {views.map((view) => (
        <Link
          key={view.value}
          href={buildTasksFilterHref({
            domains: selectedDomainIds,
            projects: selectedProjectIds,
            section: selectedSection,
            starred: starredOnly,
            view: view.value,
          })}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
            selectedView === view.value
              ? "bg-[#EFF2EE] font-semibold text-stone-950"
              : "text-stone-500 hover:text-stone-950"
          }`}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}

const filterChipOn =
  "rounded-full border border-teal-700/40 bg-white/85 px-3 py-1.5 text-[13px] font-medium text-teal-800 transition";
const filterChipOff =
  "rounded-full border border-[#E2E6DF] bg-white/85 px-3 py-1.5 text-[13px] text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700";

function DomainFilter({
  domains,
  selectedDomainIds,
  selectedProjectIds,
  selectedSection,
  starredOnly,
  view,
}: {
  domains: Array<Domain & { areas: Area[] }>;
  selectedDomainIds: string[];
  selectedProjectIds: string[];
  selectedSection: TaskSectionFilter;
  starredOnly: boolean;
  view: TaskViewFilter;
}) {
  const visibleDomains = domains.filter((domain) => !domain.isSystem);
  return (
    <nav className="flex flex-wrap gap-1.5">
      <Link
        href={buildTasksFilterHref({
          domains: [],
          projects: [],
          section: selectedSection,
          starred: starredOnly,
          view,
        })}
        className={`${
          selectedDomainIds.length === 0 ? filterChipOn : filterChipOff
        }`}
      >
        All
      </Link>
      {visibleDomains.map((domain) => (
        <Link
          key={domain.id}
          href={buildTasksFilterHref({
            domains: toggleFilterValue(selectedDomainIds, domain.id),
            projects: selectedProjectIds,
            section: selectedSection,
            starred: starredOnly,
            view,
          })}
          className={`${
            selectedDomainIds.includes(domain.id) ? filterChipOn : filterChipOff
          }`}
        >
          {domain.name}
        </Link>
      ))}
    </nav>
  );
}

function TaskFilters({
  domains,
  projects,
  selectedDomainIds,
  selectedProjectIds,
  projectSearch,
  selectedSection,
  starredOnly,
  view,
}: {
  domains: Array<Domain & { areas: Area[] }>;
  projects: Array<Project & { area: Area & { domain: Domain } }>;
  selectedDomainIds: string[];
  selectedProjectIds: string[];
  projectSearch: string;
  selectedSection: TaskSectionFilter;
  starredOnly: boolean;
  view: TaskViewFilter;
}) {
  const filtersActive =
    selectedDomainIds.length > 0 ||
    selectedProjectIds.length > 0 ||
    starredOnly;

  return (
    <details className="relative">
      <summary
        className={`inline-flex h-[38px] cursor-pointer list-none items-center rounded-full border bg-white px-4 text-[13px] font-medium transition [&::-webkit-details-marker]:hidden ${
          filtersActive
            ? "border-teal-700/40 text-teal-800"
            : "border-[#E2E6DF] text-stone-600 hover:border-teal-700/50 hover:text-teal-700"
        }`}
      >
        {filtersActive ? "Filter · on" : "Filter"}
      </summary>
      <section className="absolute left-0 z-30 mt-2 w-[min(calc(100vw-2.5rem),34rem)] rounded-[20px] border border-white/65 bg-[#FAFBF9]/75 p-4 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150">
        <div className="grid gap-3.5">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Domain
            </p>
            <DomainFilter
              domains={domains}
              selectedDomainIds={selectedDomainIds}
              selectedProjectIds={selectedProjectIds}
              selectedSection={selectedSection}
              starredOnly={starredOnly}
              view={view}
            />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Project
            </p>
            <ProjectFilter
              projects={projects}
              selectedDomainIds={selectedDomainIds}
              selectedProjectIds={selectedProjectIds}
              projectSearch={projectSearch}
              selectedSection={selectedSection}
              starredOnly={starredOnly}
              view={view}
            />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Starred
            </p>
            <nav className="flex flex-wrap gap-1.5">
              <Link
                href={buildTasksFilterHref({
                  domains: selectedDomainIds,
                  projects: selectedProjectIds,
                  section: selectedSection,
                  starred: false,
                  view,
                })}
                className={!starredOnly ? filterChipOn : filterChipOff}
              >
                All
              </Link>
              <Link
                href={buildTasksFilterHref({
                  domains: selectedDomainIds,
                  projects: selectedProjectIds,
                  section: selectedSection,
                  starred: true,
                  view,
                })}
                className={starredOnly ? filterChipOn : filterChipOff}
              >
                Starred
              </Link>
            </nav>
          </div>
        </div>
      </section>
    </details>
  );
}

function ProjectFilter({
  projects,
  selectedDomainIds,
  selectedProjectIds,
  projectSearch,
  selectedSection,
  starredOnly,
  view,
}: {
  projects: Array<Project & { area: Area & { domain: Domain } }>;
  selectedDomainIds: string[];
  selectedProjectIds: string[];
  projectSearch: string;
  selectedSection: TaskSectionFilter;
  starredOnly: boolean;
  view: TaskViewFilter;
}) {
  const normalizedSearch = projectSearch.trim().toLowerCase();
  const visibleProjects = projects.filter((project) => {
    const inDomain =
      selectedDomainIds.length === 0 ||
      selectedDomainIds.includes(project.area.domainId);
    if (!inDomain) return false;
    if (!normalizedSearch) return true;
    return [project.name, project.area.name, project.area.domain.name]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });

  return (
    <div className="space-y-2">
      <form className="flex items-center gap-2">
        {selectedDomainIds.map((domainId) => (
          <input key={domainId} type="hidden" name="domain" value={domainId} />
        ))}
        {selectedProjectIds.map((projectId) => (
          <input
            key={projectId}
            type="hidden"
            name="project"
            value={projectId}
          />
        ))}
        <input type="hidden" name="section" value={selectedSection} />
        <input type="hidden" name="view" value={view} />
        {starredOnly ? <input type="hidden" name="starred" value="1" /> : null}
        <label className="sr-only" htmlFor="project-filter-search">
          Search projects
        </label>
        <input
          id="project-filter-search"
          name="projectSearch"
          defaultValue={projectSearch}
          className="h-9 min-w-0 flex-1 rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] outline-none transition focus:border-teal-700"
        />
        <button
          type="submit"
          className="h-9 rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
        >
          Search
        </button>
      </form>
      <nav className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
        <Link
          href={buildTasksFilterHref({
            domains: selectedDomainIds,
            projects: [],
            section: selectedSection,
            starred: starredOnly,
            view,
          })}
          className={`${
            selectedProjectIds.length === 0 ? filterChipOn : filterChipOff
          }`}
        >
          All
        </Link>
        {visibleProjects.map((project) => (
          <Link
            key={project.id}
            href={buildTasksFilterHref({
              domains: selectedDomainIds,
              projects: toggleFilterValue(selectedProjectIds, project.id),
              section: selectedSection,
              starred: starredOnly,
              view,
            })}
            className={`${
              selectedProjectIds.includes(project.id)
                ? filterChipOn
                : filterChipOff
            }`}
          >
            {project.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function TaskSection({
  title,
  empty,
  anchor,
  targetDate,
  tasks,
  today,
  tomorrow,
  areaGroups,
  projects,
  slipDays,
}: {
  title: string;
  empty: string;
  anchor: string;
  targetDate: string | null;
  tasks: TaskListItem[];
  today: string;
  tomorrow: string;
  areaGroups: TaskAreaGroup[];
  projects: TaskProjectOption[];
  slipDays: number;
}) {
  return (
    <section id={anchor} className="scroll-mt-4 space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        {title}{" "}
        <span className="font-medium text-[#B0ACA2]">{tasks.length}</span>
      </h2>
      <TaskDropZone
        targetDate={targetDate}
        label={title}
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
              areaGroups={areaGroups}
              projects={projects}
              slipDays={slipDays}
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
  areaGroups,
  projects,
  slipDays,
}: {
  groups: Array<{ date: string; tasks: TaskListItem[] }>;
  today: string;
  tomorrow: string;
  areaGroups: TaskAreaGroup[];
  projects: TaskProjectOption[];
  slipDays: number;
}) {
  const count = groups.reduce((total, group) => total + group.tasks.length, 0);
  return (
    <section id="upcoming" className="scroll-mt-4 space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Upcoming <span className="font-medium text-[#B0ACA2]">{count}</span>
      </h2>
      {groups.length === 0 ? (
        <p className="text-sm text-[#6B7268]">No upcoming dated tasks.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.date} className="space-y-2">
              <h3 className="text-[13px] font-medium text-stone-500">
                {formatDateOnly(group.date)}
              </h3>
              <TaskDropZone
                targetDate={group.date}
                label={formatDateOnly(group.date)}
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
                      areaGroups={areaGroups}
                      projects={projects}
                      slipDays={slipDays}
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

function AllOpenSection({
  tasks,
  today,
  tomorrow,
  areaGroups,
  projects,
  slipDays,
  totalCount,
}: {
  tasks: TaskListItem[];
  today: string;
  tomorrow: string;
  areaGroups: TaskAreaGroup[];
  projects: TaskProjectOption[];
  slipDays: number;
  totalCount: number | null;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        All Open{" "}
        <span className="font-medium text-[#B0ACA2]">
          {totalCount ?? tasks.length}
        </span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-[#6B7268]">No open tasks.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              today={today}
              tomorrow={tomorrow}
              areaGroups={areaGroups}
              projects={projects}
              slipDays={slipDays}
            />
          ))}
          {totalCount !== null && totalCount > tasks.length ? (
            <p className="text-sm text-stone-500">
              Showing the first {tasks.length} of {totalCount} open tasks.
              Search finds every task.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function DoneSection({
  tasks,
  totalCount,
}: {
  tasks: DoneTaskItem[];
  totalCount: number | null;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Done{" "}
        <span className="font-medium text-[#B0ACA2]">
          {totalCount ?? tasks.length}
        </span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-[#6B7268]">No completed tasks yet.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <article
              key={task.id}
              className="rounded-[14px] border border-[#E2E6DF] bg-white p-4"
            >
              <Link
                href={`/tasks/${task.id}`}
                className="-m-1 block rounded-[10px] p-1 transition hover:bg-[#F7F9F5]"
              >
                <p className="text-sm font-medium text-stone-800">
                  {task.title}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {[
                    task.area.domain.name,
                    task.area.name,
                    task.project?.name,
                    task.completedAt
                      ? `completed ${formatDateOnly(task.completedAt)}`
                      : null,
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join(" / ")}
                </p>
              </Link>
            </article>
          ))}
          {totalCount !== null && totalCount > tasks.length ? (
            <p className="text-sm text-stone-500">
              Showing the most recent {tasks.length} of {totalCount} completed
              tasks. Search finds every task.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function TaskCard({
  task,
  today,
  tomorrow,
  areaGroups,
  projects,
  slipDays,
}: {
  task: TaskListItem;
  today: string;
  tomorrow: string;
  areaGroups: TaskAreaGroup[];
  projects: TaskProjectOption[];
  slipDays: number;
}) {
  return (
    <article className="rounded-[14px] border border-[#E2E6DF] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <DraggableTaskLink
          taskId={task.id}
          href={`/tasks/${task.id}`}
          title={task.title}
          detail={formatTaskDetail(task, slipDays)}
          currentDueDate={task.dueDate?.toISOString().slice(0, 10) ?? null}
          currentAreaId={task.areaId}
          currentProjectId={task.projectId}
          areaGroups={areaGroups}
          projects={projects}
          today={today}
          tomorrow={tomorrow}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <TaskStarButton taskId={task.id} starred={task.starred} />
          <TaskCompleteButton taskId={task.id} />
        </div>
      </div>
      <SubtaskList
        subtasks={task.subtasks}
        today={today}
        tomorrow={tomorrow}
        areaGroups={areaGroups}
        projects={projects}
      />
    </article>
  );
}

function SubtaskList({
  subtasks,
  today,
  tomorrow,
  areaGroups,
  projects,
}: {
  subtasks: TaskListItem["subtasks"];
  today: string;
  tomorrow: string;
  areaGroups: TaskAreaGroup[];
  projects: TaskProjectOption[];
}) {
  if (subtasks.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 divide-y divide-[#EEF1EC] border-t border-[#EEF1EC] pt-2">
      {subtasks.map((subtask) => (
        <div
          key={subtask.id}
          className="flex items-center justify-between gap-3 py-2"
        >
          <DraggableTaskLink
            taskId={subtask.id}
            href={`/tasks/${subtask.id}`}
            title={subtask.title}
            detail={
              subtask.dueDate ? formatDateOnly(subtask.dueDate) : "Subtask"
            }
            currentDueDate={subtask.dueDate?.toISOString().slice(0, 10) ?? null}
            currentAreaId={subtask.areaId}
            currentProjectId={subtask.projectId}
            areaGroups={areaGroups}
            projects={projects}
            today={today}
            tomorrow={tomorrow}
          />
          <TaskCompleteButton taskId={subtask.id} />
        </div>
      ))}
    </div>
  );
}

type TaskListItem = Task & {
  area: Area & { domain: Domain };
  project: Project | null;
  subtasks: Array<Task & { area: Area; project: Project | null }>;
};

type DoneTaskItem = Task & {
  area: Area & { domain: Domain };
  project: Project | null;
};

type TaskAreaGroup = {
  domainName: string;
  areas: Array<{ id: string; name: string }>;
};

type TaskProjectOption = {
  id: string;
  name: string;
  areaId: string;
  areaName: string;
};

function formatTaskDetail(task: TaskListItem, slipDays: number) {
  return [
    task.area.domain.name,
    task.area.name,
    task.project?.name,
    task.dueDate ? formatDateOnly(task.dueDate) : null,
    task.recurrenceRule ? "repeats" : null,
    taskOpenSinceFact(task, slipDays),
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

async function loadTasks(view: TaskViewFilter) {
  try {
    const [tasks, doneTasks, openCount, doneCount, projects, domains] =
      await Promise.all([
        view === "done"
          ? Promise.resolve([] as TaskListItem[])
          : prisma.task.findMany({
              where: {
                status: "open",
                OR: [
                  { parentTaskId: null },
                  { parent: { status: { not: "open" } } },
                ],
              },
              include: {
                area: { include: { domain: true } },
                project: true,
                subtasks: {
                  where: { status: "open" },
                  include: { area: true, project: true },
                  orderBy: [
                    { dueDate: "asc" },
                    { sortOrder: "asc" },
                    { createdAt: "desc" },
                  ],
                },
              },
              orderBy: [
                { dueDate: "asc" },
                { sortOrder: "asc" },
                { createdAt: "desc" },
              ],
              take: view === "schedule" ? 80 : 200,
            }),
        view === "done" || view === "all"
          ? prisma.task.findMany({
              where: { status: "completed" },
              include: {
                area: { include: { domain: true } },
                project: true,
              },
              orderBy: [{ completedAt: "desc" }],
              take: 100,
            })
          : Promise.resolve([] as DoneTaskItem[]),
        view === "open" || view === "all"
          ? prisma.task.count({
              where: {
                status: "open",
                OR: [
                  { parentTaskId: null },
                  { parent: { status: { not: "open" } } },
                ],
              },
            })
          : Promise.resolve(0),
        view === "done" || view === "all"
          ? prisma.task.count({ where: { status: "completed" } })
          : Promise.resolve(0),
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

    return {
      ok: true as const,
      tasks,
      doneTasks,
      openCount,
      doneCount,
      projects,
      domains,
    };
  } catch {
    return { ok: false as const };
  }
}
