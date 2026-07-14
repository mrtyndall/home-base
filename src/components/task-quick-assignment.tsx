"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type AssignmentArea = {
  id: string;
  name: string;
};

type AssignmentProject = {
  id: string;
  name: string;
  areaId: string;
};

export function TaskQuickAssignment({
  taskId,
  areas,
  projects,
}: {
  taskId: string;
  areas: AssignmentArea[];
  projects: AssignmentProject[];
}) {
  const router = useRouter();
  const [areaId, setAreaId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleProjects = useMemo(
    () =>
      areaId
        ? projects.filter((candidate) => candidate.areaId === areaId)
        : projects,
    [areaId, projects],
  );

  function changeArea(nextAreaId: string) {
    setAreaId(nextAreaId);
    const candidate = projects.find((project) => project.id === projectId);
    if (candidate && candidate.areaId !== nextAreaId) {
      setProjectId("");
    }
    setError(null);
  }

  async function assignTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaId && !projectId) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/assignment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaId: projectId ? null : areaId,
          projectId: projectId || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Assignment failed");
      }
      router.refresh();
    } catch {
      setError("Assignment was not updated.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <details className="group rounded-[14px] border border-[#DDE5DD] bg-[#F7FAF5] open:bg-white">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-sm font-medium text-teal-800 outline-none transition hover:text-teal-950 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700 [&::-webkit-details-marker]:hidden">
        Assign to Area or Project
        <span aria-hidden="true" className="text-lg leading-none text-teal-700 group-open:rotate-45">
          +
        </span>
      </summary>
      <form
        onSubmit={assignTask}
        aria-busy={isSaving}
        className="grid gap-3 border-t border-[#E2E6DF] p-3.5 sm:grid-cols-2"
      >
        <label className="text-[13px] font-medium text-stone-600">
          Area
          <select
            value={areaId}
            onChange={(event) => changeArea(event.target.value)}
            className="mt-1 h-11 w-full rounded-[12px] border border-[#D7DDD4] bg-white px-3 text-base text-stone-950 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
          >
            <option value="">Choose an Area</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[13px] font-medium text-stone-600">
          Project
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setError(null);
            }}
            className="mt-1 h-11 w-full rounded-[12px] border border-[#D7DDD4] bg-white px-3 text-base text-stone-950 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
          >
            <option value="">Choose a Project</option>
            {visibleProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className="min-h-5 text-[13px] text-red-700">
            {error}
          </p>
          <button
            type="submit"
            disabled={isSaving || (!areaId && !projectId)}
            className="h-11 w-full rounded-full bg-teal-700 px-5 text-sm font-medium text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#C9D1C7] disabled:text-stone-500 sm:w-auto"
          >
            {isSaving ? "Assigning…" : "Assign task"}
          </button>
        </div>
      </form>
    </details>
  );
}
