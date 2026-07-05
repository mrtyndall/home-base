"use client";

import { type FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { createQuickTask } from "@/app/actions";

type SavedTask = {
  id: string;
  title: string;
  areaName: string;
  projectName: string | null;
};

export type QuickAddProject = {
  id: string;
  name: string;
  areaId: string;
  areaName: string;
};

export type QuickAddAreaGroup = {
  domainName: string;
  areas: Array<{ id: string; name: string }>;
};

export function TaskQuickAdd({
  areaGroups = [],
  projects = [],
  className = "",
}: {
  areaGroups?: QuickAddAreaGroup[];
  projects?: QuickAddProject[];
  className?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [areaId, setAreaId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [savedTask, setSavedTask] = useState<SavedTask | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  const filteredProjects = areaId
    ? projects.filter((project) => project.areaId === areaId)
    : projects;
  const selectedProject = projects.find((project) => project.id === projectId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || pending) return;

    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/tasks/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          dueDate,
          areaId,
          projectId,
        }),
      });

      if (!response.ok) {
        throw new Error("Task save failed.");
      }

      const result = (await response.json()) as { task: SavedTask };
      setSavedTask(result.task);
      setTitle("");
      setDueDate("");
      setAreaId("");
      setProjectId("");
      setProjectSearch("");
      startTransition(() => router.refresh());
    } catch {
      setError("Task was not saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <form
        action={createQuickTask}
        onSubmit={handleSubmit}
        className="rounded-[14px] border border-[#E2E6DF] bg-white p-2"
      >
        <div className="flex items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Quick add task
            </span>
            <input
              name="title"
              required
              aria-label="Task title"
              placeholder="Task title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-9 w-full min-w-0 bg-transparent px-1 text-base outline-none placeholder:text-stone-400"
            />
          </label>
          <label
            title="Set due date"
            className={`relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full border bg-white transition hover:border-teal-700/50 hover:text-teal-700 ${
              dueDate
                ? "border-teal-700 text-teal-700"
                : "border-[#E2E6DF] text-stone-600"
            }`}
          >
            <span className="sr-only">Set due date</span>
            <CalendarDays size={17} />
            <input
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Set due date"
            />
          </label>
          {areaGroups.length > 0 ? (
            <select
              name="areaId"
              aria-label="Area"
              value={areaId}
              onChange={(event) => {
                setAreaId(event.target.value);
                setProjectId("");
                setProjectSearch("");
              }}
              className="h-10 max-w-32 shrink rounded-full border border-[#E2E6DF] bg-white px-3 text-sm text-stone-700 outline-none focus:border-teal-700 sm:max-w-40"
            >
              <option value="">Inbox</option>
              {areaGroups.map((group) => (
                <optgroup key={group.domainName} label={group.domainName}>
                  {group.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : null}
          <button
            type="submit"
            disabled={pending || title.trim().length === 0}
            title={pending ? "Saving task" : "Add task"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-[#D6DBD3]"
          >
            <Plus size={18} />
          </button>
        </div>
        {projects.length > 0 ? (
          <div className="mt-2 grid gap-1.5 border-t border-[#EEF1EC] pt-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <input type="hidden" name="projectId" value={projectId} />
            <label
              htmlFor="quick-add-project-search"
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]"
            >
              Project
            </label>
            <div className="flex min-w-0 items-center gap-2">
              <input
                id="quick-add-project-search"
                list="quick-add-projects"
                value={projectSearch}
                onChange={(event) => {
                  const value = event.target.value;
                  setProjectSearch(value);
                  const matchedProject = filteredProjects.find(
                    (project) =>
                      project.name.toLocaleLowerCase() ===
                      value.toLocaleLowerCase(),
                  );
                  setProjectId(matchedProject?.id ?? "");
                }}
                placeholder="Search projects"
                aria-label="Search projects"
                className="h-9 min-w-0 flex-1 rounded-full border border-[#E2E6DF] bg-white px-3 text-sm text-stone-700 outline-none placeholder:text-stone-400 focus:border-teal-700"
              />
              <datalist id="quick-add-projects">
                {filteredProjects.map((project) => (
                  <option
                    key={project.id}
                    value={project.name}
                    label={`${project.areaName} / ${project.name}`}
                  />
                ))}
              </datalist>
              {selectedProject ? (
                <button
                  type="button"
                  onClick={() => {
                    setProjectId("");
                    setProjectSearch("");
                  }}
                  className="h-9 shrink-0 rounded-full border border-[#E2E6DF] bg-white px-3 text-sm text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {selectedProject ? (
              <p className="text-xs text-[#9AA096] sm:col-start-2">
                Filing to {selectedProject.areaName} / {selectedProject.name}
              </p>
            ) : null}
          </div>
        ) : null}
      </form>
      {savedTask ? (
        <Link
          href={`/tasks/${savedTask.id}`}
          className="block rounded-full border border-teal-700/40 bg-white px-4 py-2 text-sm text-teal-800 transition hover:border-teal-700"
        >
          Saved: {savedTask.title} / {savedTask.areaName}
          {savedTask.projectName ? ` / ${savedTask.projectName}` : ""}
        </Link>
      ) : null}
      {error ? <p className="text-[13px] text-amber-800">{error}</p> : null}
    </div>
  );
}
