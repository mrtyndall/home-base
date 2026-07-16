"use client";

import type { Area } from "@prisma/client";
import { X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { convertPendingCapture } from "@/app/actions";

const targetLabels = {
  task: "Task",
  idea: "Idea",
  note: "Note",
  reference: "Reference",
} as const;

type TargetType = keyof typeof targetLabels;

type DestinationProject = {
  id: string;
  name: string;
  areaId: string | null;
};

export function CaptureFileActions({
  captureId,
  reviewId,
  proposalId,
  areas,
  projects = [],
  align = "left",
  label = "File",
  defaultAreaId = "",
  defaultProjectId = "",
  defaultType = null,
}: {
  captureId: string;
  reviewId?: string;
  proposalId?: string;
  areas: Area[];
  projects?: DestinationProject[];
  align?: "left" | "right";
  label?: string;
  defaultAreaId?: string;
  defaultProjectId?: string;
  defaultType?: string | null;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [areaId, setAreaId] = useState(
    defaultProjectId ? "" : defaultAreaId,
  );
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [selectedType, setSelectedType] = useState<TargetType | null>(
    isTargetType(defaultType) ? defaultType : null,
  );

  const selectedAreaName = useMemo(() => {
    if (!areaId) return null;
    return areas.find((candidate) => candidate.id === areaId)?.name ?? null;
  }, [areaId, areas]);
  const selectedProject = useMemo(
    () => projects.find((candidate) => candidate.id === projectId) ?? null,
    [projectId, projects],
  );
  const selectedDestinationName =
    selectedProject?.name ?? selectedAreaName ?? "Global / Inbox";

  function selectGlobal() {
    setAreaId("");
    setProjectId("");
  }

  function selectArea(nextAreaId: string) {
    setAreaId(nextAreaId);
    setProjectId("");
  }

  function selectProject(nextProjectId: string) {
    setAreaId("");
    setProjectId(nextProjectId);
  }

  function closePicker() {
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary className="inline-flex h-[30px] cursor-pointer list-none items-center rounded-full border border-teal-700/40 bg-white px-3 text-[13px] font-medium text-teal-800 transition hover:border-teal-700 [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <button
        type="button"
        aria-label="Dismiss filing options"
        onClick={closePicker}
        className="fixed inset-0 z-40 bg-stone-950/20 sm:hidden"
      />
      <form
        action={convertPendingCapture}
        className={`fixed inset-x-3 bottom-[calc(var(--app-dock-clearance)+0.75rem)] z-50 max-h-[calc(100dvh-var(--app-dock-clearance)-1.5rem)] overflow-y-auto rounded-[22px] border border-white/65 bg-[#FAFBF9]/95 p-3 shadow-[0_-12px_40px_rgba(28,25,23,0.20)] backdrop-blur-xl backdrop-saturate-150 sm:absolute sm:bottom-auto sm:inset-x-auto sm:mt-2 sm:max-h-none sm:w-[min(300px,calc(100vw-2rem))] sm:overflow-visible sm:rounded-[18px] sm:bg-[#FAFBF9]/90 sm:shadow-[0_12px_36px_rgba(28,25,23,0.18)] ${
          align === "right" ? "sm:right-0" : "sm:left-0"
        }`}
      >
        <input type="hidden" name="captureId" value={captureId} />
        {reviewId ? (
          <input type="hidden" name="reviewId" value={reviewId} />
        ) : null}
        {proposalId ? (
          <input type="hidden" name="proposalId" value={proposalId} />
        ) : null}
        {selectedType ? (
          <input type="hidden" name="targetType" value={selectedType} />
        ) : null}
        {areaId ? <input type="hidden" name="areaId" value={areaId} /> : null}
        {projectId ? (
          <input type="hidden" name="projectId" value={projectId} />
        ) : null}
        <div className="flex min-h-11 items-center justify-between gap-3 sm:min-h-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            File as
          </p>
          <button
            type="button"
            aria-label="Close filing options"
            onClick={closePicker}
            className="grid h-11 w-11 place-items-center rounded-full text-stone-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 sm:hidden"
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {Object.entries(targetLabels).map(([value, targetLabel]) => (
            <ConvertChoice
              key={value}
              value={value as TargetType}
              label={targetLabel}
              selected={selectedType === value}
              onSelect={setSelectedType}
            />
          ))}
        </div>
        <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Into
        </p>
        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-[14px] border border-[#E2E6DF] bg-white p-1.5">
          <div className="grid gap-1">
            <DestinationChoice
              label="Global / Inbox"
              selected={!areaId && !projectId}
              onSelect={selectGlobal}
            />
            {areas.length ? (
              <p className="px-2.5 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
                Areas
              </p>
            ) : null}
            {areas.map((area) => (
              <DestinationChoice
                key={area.id}
                label={area.name}
                selected={areaId === area.id}
                onSelect={() => selectArea(area.id)}
              />
            ))}
            {projects.length ? (
              <p className="px-2.5 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
                Projects
              </p>
            ) : null}
            {projects.map((project) => {
              const projectAreaName = project.areaId
                ? areas.find((area) => area.id === project.areaId)?.name
                : null;
              return (
                <DestinationChoice
                  key={project.id}
                  label={project.name}
                  detail={projectAreaName ?? "No Area"}
                  selected={projectId === project.id}
                  onSelect={() => selectProject(project.id)}
                />
              );
            })}
          </div>
        </div>
        {selectedType ? (
          <div className="mt-3 rounded-[14px] border border-teal-700/20 bg-white px-3 py-2">
            <p className="text-[13px] leading-snug text-stone-700">
              File as{" "}
              <span className="font-semibold text-stone-950">
                {targetLabels[selectedType]}
              </span>{" "}
              into{" "}
              <span className="font-semibold text-stone-950">
                {selectedDestinationName}
              </span>
              ?
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="submit"
                className="h-[30px] rounded-full bg-teal-700 px-3 text-[13px] font-medium text-white transition hover:bg-teal-800"
              >
                Confirm file
              </button>
              <button
                type="button"
                onClick={() => setSelectedType(null)}
                className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[12px] leading-snug text-[#6B7268]">
            Choose a type to confirm where this will land.
          </p>
        )}
      </form>
    </details>
  );
}

function DestinationChoice({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-9 items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] font-medium transition ${
        selected
          ? "bg-[#E8F5F0] text-teal-800"
          : "text-stone-700 hover:bg-[#F7F9F5] hover:text-stone-950"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {detail ? (
          <span className="block truncate text-[10px] font-normal text-[#9AA096]">
            {detail}
          </span>
        ) : null}
      </span>
      {selected ? (
        <span className="shrink-0 text-[11px] text-teal-700">Selected</span>
      ) : null}
    </button>
  );
}

function ConvertChoice({
  value,
  label,
  selected,
  onSelect,
}: {
  value: TargetType;
  label: string;
  selected: boolean;
  onSelect: (value: TargetType) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`h-[30px] rounded-full border px-3 text-[13px] font-medium transition ${
        selected
          ? "border-teal-700 bg-[#E8F5F0] text-teal-800"
          : "border-[#E2E6DF] bg-white text-stone-600 hover:border-teal-700/50 hover:text-teal-700"
      }`}
    >
      {label}
    </button>
  );
}

function isTargetType(value: string | null): value is TargetType {
  return value !== null && value in targetLabels;
}
