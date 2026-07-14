"use client";

import type { Area } from "@prisma/client";
import { useMemo, useState } from "react";
import { convertPendingCapture } from "@/app/actions";

const targetLabels = {
  task: "Task",
  idea: "Idea",
  note: "Note",
  reference: "Reference",
} as const;

type TargetType = keyof typeof targetLabels;

export function CaptureFileActions({
  captureId,
  reviewId,
  proposalId,
  areas,
  align = "left",
  label = "File",
  defaultAreaId = "",
  defaultType = null,
}: {
  captureId: string;
  reviewId?: string;
  proposalId?: string;
  areas: Area[];
  align?: "left" | "right";
  label?: string;
  defaultAreaId?: string;
  defaultType?: TargetType | null;
}) {
  const [areaId, setAreaId] = useState(defaultAreaId);
  const [selectedType, setSelectedType] = useState<TargetType | null>(
    defaultType,
  );

  const selectedAreaName = useMemo(() => {
    if (!areaId) return null;
    return areas.find((candidate) => candidate.id === areaId)?.name ?? null;
  }, [areaId, areas]);

  return (
    <details className="relative">
      <summary className="inline-flex h-[30px] cursor-pointer list-none items-center rounded-full border border-teal-700/40 bg-white px-3 text-[13px] font-medium text-teal-800 transition hover:border-teal-700 [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <form
        action={convertPendingCapture}
        className={`absolute z-20 mt-2 w-[270px] rounded-[18px] border border-white/65 bg-[#FAFBF9]/80 p-3 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150 ${
          align === "right" ? "right-0" : "left-0"
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
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          File as
        </p>
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
        <div className="mt-1.5 max-h-44 overflow-y-auto rounded-[14px] border border-[#E2E6DF] bg-white p-1.5">
          <div className="grid gap-1">
            {areas.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => setAreaId(area.id)}
                className={`flex min-h-8 items-center justify-between rounded-[10px] px-2.5 py-1.5 text-left text-[13px] font-medium transition ${
                  areaId === area.id
                    ? "bg-[#E8F5F0] text-teal-800"
                    : "text-stone-700 hover:bg-[#F7F9F5] hover:text-stone-950"
                }`}
              >
                <span>{area.name}</span>
                {areaId === area.id ? <span className="text-[11px] text-teal-700">Selected</span> : null}
              </button>
            ))}
          </div>
        </div>
        {selectedType ? (
          <div className="mt-3 rounded-[14px] border border-teal-700/20 bg-white px-3 py-2">
            <p className="text-[13px] leading-snug text-stone-700">
              {selectedAreaName ? (
                <>
                  File as{" "}
                  <span className="font-semibold text-stone-950">
                    {targetLabels[selectedType]}
                  </span>{" "}
                  into{" "}
                  <span className="font-semibold text-stone-950">
                    {selectedAreaName}
                  </span>
                  ?
                </>
              ) : (
                "Choose an area before filing."
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="submit"
                disabled={!selectedAreaName}
                className="h-[30px] rounded-full bg-teal-700 px-3 text-[13px] font-medium text-white transition hover:bg-teal-800 disabled:bg-[#D7DDD4] disabled:text-stone-500"
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
