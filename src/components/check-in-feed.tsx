import type { CheckIn } from "@prisma/client";
import { formatShortDate } from "@/lib/dates";
import { CheckInComposer } from "@/components/check-in-composer";

export function CheckInFeed({
  parentType,
  parentId,
  checkIns,
}: {
  parentType: "area" | "project";
  parentId: string;
  checkIns: Array<Pick<CheckIn, "id" | "bodyMd" | "createdAt">>;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Check-ins
        </h2>
        <CheckInComposer parentType={parentType} parentId={parentId} />
      </div>
      {checkIns.length === 0 ? null : (
        <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
          {checkIns.map((checkIn) => (
            <div key={checkIn.id} className="px-4 py-3.5">
              <p className="text-xs text-[#9AA096]">
                {formatShortDate(checkIn.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">
                {checkIn.bodyMd}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
