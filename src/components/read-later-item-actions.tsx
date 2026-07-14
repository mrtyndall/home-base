"use client";

import { ArrowUpRight } from "lucide-react";
import { useRef, useState } from "react";
import { fileReadLaterAction, setReadLaterStatusAction } from "@/app/actions";
import type { ReadLaterProjectOption } from "@/components/read-later-form";
import type { AreaOption } from "@/lib/hierarchy";
import type { ReadLaterFilingIntent, ReadLaterStatus } from "@/lib/read-later";
import {
  nextReadLaterMutationError,
  readLaterMutationCoordinator,
} from "@/lib/read-later-mutation-coordinator";

type WritableFiling = Exclude<ReadLaterFilingIntent, { mode: "unchanged" }>;

export function ReadLaterItemActions({
  itemId,
  url,
  readStatus,
  currentAreaId,
  currentProjectId,
  areaOptions,
  projects,
}: {
  itemId: string;
  url: string;
  readStatus: string;
  currentAreaId: string | null;
  currentProjectId: string | null;
  areaOptions: readonly AreaOption[];
  projects: readonly ReadLaterProjectOption[];
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingCount = useRef(0);

  function runMutation(
    label: string,
    operation: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) {
    pendingCount.current += 1;
    setPendingAction(label);
    setError(null);
    void readLaterMutationCoordinator
      .run(itemId, operation)
      .then((result) => {
        setError(nextReadLaterMutationError(result));
      })
      .catch(() => setError("Could not update this Read Later item. Try again."))
      .finally(() => {
        pendingCount.current -= 1;
        if (pendingCount.current === 0) setPendingAction(null);
      });
  }

  return (
    <ReadLaterItemActionControls
      url={url}
      readStatus={readStatus}
      currentAreaId={currentAreaId}
      currentProjectId={currentProjectId}
      areaOptions={areaOptions}
      projects={projects}
      pendingAction={pendingAction}
      error={error}
      onStatus={(status) => runMutation(
        `status:${status}`,
        () => setReadLaterStatusAction({ referenceId: itemId, status }),
      )}
      onFile={(filing) => runMutation(
        `filing:${filing.mode}`,
        () => fileReadLaterAction({ referenceId: itemId, filing }),
      )}
    />
  );
}

export function ReadLaterItemActionControls({
  url,
  readStatus,
  currentAreaId,
  currentProjectId,
  areaOptions,
  projects,
  pendingAction,
  error,
  onStatus,
  onFile,
}: {
  url: string;
  readStatus: string;
  currentAreaId: string | null;
  currentProjectId: string | null;
  areaOptions: readonly AreaOption[];
  projects: readonly ReadLaterProjectOption[];
  pendingAction: string | null;
  error: string | null;
  onStatus(status: ReadLaterStatus): void;
  onFile(filing: WritableFiling): void;
}) {
  const busy = pendingAction !== null;
  const defaultDestination = currentProjectId
    ? `project:${currentProjectId}`
    : currentAreaId
      ? `area:${currentAreaId}`
      : "unfiled";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-teal-700 px-4 text-[13px] font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        Open <ArrowUpRight size={13} strokeWidth={2.4} />
      </a>
      <button
        type="button"
        disabled={busy}
        onClick={() => onStatus(readStatus === "unread" ? "read" : "unread")}
        className="min-h-11 rounded-full px-3.5 text-[13px] font-medium text-stone-700 transition hover:bg-[#F1F4EF] hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-50"
      >
        {pendingAction?.startsWith("status:")
          ? "Updating…"
          : readStatus === "unread" ? "Mark read" : "Mark unread"}
      </button>
      {readStatus !== "archived" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus("archived")}
          className="min-h-11 rounded-full px-3.5 text-[13px] font-medium text-stone-600 transition hover:bg-[#F1F4EF] hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-50"
        >
          Archive
        </button>
      ) : null}
      <details className="basis-full w-full">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full px-3.5 text-[13px] font-medium text-stone-700 transition hover:bg-[#F1F4EF] hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
          File
        </summary>
        <form
          className="mt-2 w-full space-y-3 rounded-[16px] border border-[#DCE2DA] bg-[#FAFBF9] p-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get("destination") ?? "unfiled");
            if (value === "unfiled") return onFile({ mode: "unfiled" });
            const [kind, id] = value.split(":", 2);
            if (kind === "area" && id) onFile({ mode: "area", areaId: id });
            if (kind === "project" && id) onFile({ mode: "project", projectId: id });
          }}
        >
          <label className="block text-[13px] font-medium text-stone-600">
            <span>Destination</span>
            <select
              name="destination"
              defaultValue={defaultDestination}
              disabled={busy}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-[#D7DDD4] bg-white px-3 text-base text-stone-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-wait disabled:opacity-50"
            >
              <option value="unfiled">No filing</option>
              <optgroup label="Areas">
                {areaOptions.map((area) => (
                  <option key={area.id} value={`area:${area.id}`}>{area.path}</option>
                ))}
              </optgroup>
              <optgroup label="Projects">
                {projects.map((project) => (
                  <option key={project.id} value={`project:${project.id}`}>
                    {project.areaPath ? `${project.areaPath} / ${project.name}` : `No area yet / ${project.name}`}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 w-full rounded-full bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-wait disabled:bg-[#AEB8AF]"
          >
            {pendingAction?.startsWith("filing:") ? "Saving…" : "Save filing"}
          </button>
        </form>
      </details>
      <ReadLaterMutationError error={error} />
    </div>
  );
}

export function ReadLaterMutationError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" aria-live="polite" className="basis-full text-sm text-stone-800">
      {error}
    </p>
  ) : null;
}
