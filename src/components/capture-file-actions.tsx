"use client";

import type { Area, Domain } from "@prisma/client";
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
  domains,
  align = "left",
  label = "File",
}: {
  captureId: string;
  reviewId?: string;
  domains: Array<Domain & { areas: Area[] }>;
  align?: "left" | "right";
  label?: string;
}) {
  const [areaId, setAreaId] = useState("");
  const [selectedType, setSelectedType] = useState<TargetType | null>(null);

  const selectedAreaName = useMemo(() => {
    if (!areaId) return null;
    for (const domain of domains) {
      const area = domain.areas.find((candidate) => candidate.id === areaId);
      if (area) return area.name;
    }
    return null;
  }, [areaId, domains]);

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
        {selectedType ? (
          <input type="hidden" name="targetType" value={selectedType} />
        ) : null}
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
        <label className="mt-1.5 block">
          <span className="sr-only">Area</span>
          <select
            name="areaId"
            value={areaId}
            required
            onChange={(event) => setAreaId(event.target.value)}
            className="h-[30px] min-w-0 rounded-full border border-[#E2E6DF] bg-white px-2.5 text-[13px] outline-none focus:border-teal-700"
          >
            <option value="">Choose area</option>
            {domains.map((domain) => (
              <optgroup key={domain.id} label={domain.name}>
                {domain.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
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
