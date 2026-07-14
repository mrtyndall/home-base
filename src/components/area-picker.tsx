import type { AreaHierarchyRecord } from "@/lib/hierarchy";
import { flattenAreaOptions } from "@/lib/hierarchy";

type AreaPickerProps = {
  areas: readonly AreaHierarchyRecord[];
  name?: string;
  defaultAreaId?: string | null;
  lockedAreaId?: string | null;
  nullable?: boolean;
  excludedAreaIds?: readonly string[];
  label?: string;
};

export function AreaPicker({
  areas,
  name = "areaId",
  defaultAreaId = null,
  lockedAreaId,
  nullable = true,
  excludedAreaIds = [],
  label = "Area",
}: AreaPickerProps) {
  const excluded = new Set(excludedAreaIds);
  const options = flattenAreaOptions(areas).filter((option) => !excluded.has(option.id));

  if (lockedAreaId !== undefined && lockedAreaId !== null) {
    const locked = options.find((option) => option.id === lockedAreaId);
    return (
      <div className="rounded-[12px] border border-[#E2E6DF] bg-[#F7F9F5] px-3.5 py-2.5">
        <input type="hidden" name={name} value={lockedAreaId} />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">{label}</p>
        <p className="mt-0.5 text-sm text-stone-800">{locked?.path ?? "No area yet"}</p>
      </div>
    );
  }

  return (
    <label className="block text-[13px] font-medium text-stone-600">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={defaultAreaId ?? ""}
        required={!nullable}
        className="mt-1 min-h-11 w-full rounded-[12px] border border-[#D7DDD4] bg-white px-3 text-base text-stone-950 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
      >
        {nullable ? <option value="">No area yet</option> : null}
        {!nullable && !defaultAreaId ? <option value="" disabled>Choose an area</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.path}</option>
        ))}
      </select>
    </label>
  );
}
