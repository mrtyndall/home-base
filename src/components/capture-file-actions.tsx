import type { Area, Domain } from "@prisma/client";
import { convertPendingCapture } from "@/app/actions";

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
        {reviewId ? <input type="hidden" name="reviewId" value={reviewId} /> : null}
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          File as
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <ConvertButton value="task" label="Task" />
          <ConvertButton value="idea" label="Idea" />
          <ConvertButton value="note" label="Note" />
          <ConvertButton value="reference" label="Reference" />
        </div>
        <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Into
        </p>
        <label className="mt-1.5 block">
          <span className="sr-only">Area</span>
          <select
            name="areaId"
            defaultValue="area_inbox"
            className="h-[30px] min-w-0 rounded-full border border-[#E2E6DF] bg-white px-2.5 text-[13px] outline-none focus:border-teal-700"
          >
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
      </form>
    </details>
  );
}

function ConvertButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="submit"
      name="targetType"
      value={value}
      className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
    >
      {label}
    </button>
  );
}
