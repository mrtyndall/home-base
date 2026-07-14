"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";
import { saveReadLaterAction, type ReadLaterFormState } from "@/app/actions";
import type { ReadLaterProjectOption } from "@/components/read-later-form";

const initialState: ReadLaterFormState = { status: "idle", message: "" };

export function ReadLaterFormClient({
  areaPicker,
  projects,
}: {
  areaPicker: ReactNode;
  projects: readonly ReadLaterProjectOption[];
}) {
  const [state, formAction, pending] = useActionState(saveReadLaterAction, initialState);
  const [destination, setDestination] = useState<"none" | "area" | "project">("none");

  return (
    <section className="rounded-[18px] border border-[#DCE2DA] bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <form action={formAction} className="space-y-3.5">
        <div>
          <label htmlFor="read-later-url" className="text-[13px] font-medium text-stone-700">
            Link
          </label>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              id="read-later-url"
              type="url"
              name="url"
              required
              inputMode="url"
              autoComplete="url"
              placeholder="https://"
              className="min-h-11 min-w-0 rounded-[12px] border border-[#D7DDD4] bg-white px-3.5 text-base text-stone-950 outline-none transition placeholder:text-[#B0B7AD] focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
            />
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:bg-[#AEB8AF]"
            >
              {pending ? "Saving…" : "Save link"}
            </button>
          </div>
        </div>

        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full px-1 text-[13px] font-medium text-stone-600 transition hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
            Filing <span className="ml-1.5 text-[#9AA096]">optional</span>
          </summary>
          <div className="space-y-3 border-t border-[#EEF1EC] pt-3">
            <label className="block text-[13px] font-medium text-stone-600">
              <span>Destination</span>
              <select
                value={destination}
                onChange={(event) => setDestination(event.target.value as typeof destination)}
                className="mt-1 min-h-11 w-full rounded-[12px] border border-[#D7DDD4] bg-white px-3 text-base text-stone-950 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
              >
                <option value="none">No filing yet</option>
                <option value="area">Area</option>
                <option value="project">Project</option>
              </select>
            </label>
            {destination === "area" ? areaPicker : null}
            {destination === "project" ? (
              <label className="block text-[13px] font-medium text-stone-600">
                <span>File to Project</span>
                <select
                  name="projectId"
                  defaultValue=""
                  className="mt-1 min-h-11 w-full rounded-[12px] border border-[#D7DDD4] bg-white px-3 text-base text-stone-950 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
                >
                  <option value="">No filing yet</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.areaPath
                        ? `${project.areaPath} / ${project.name}`
                        : `No area yet / ${project.name}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </details>

        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={`text-sm ${state.status === "error" ? "text-stone-800" : "text-teal-800"}`}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
