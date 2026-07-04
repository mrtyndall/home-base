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
  const visibleCheckIns = checkIns.slice(0, 3);
  const earlierCheckIns = checkIns.slice(3);

  function CheckInRow({
    checkIn,
  }: {
    checkIn: Pick<CheckIn, "id" | "bodyMd" | "createdAt">;
  }) {
    return (
      <div className="px-4 py-3.5">
        <p className="text-xs text-[#9AA096]">
          {formatShortDate(checkIn.createdAt)}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">
          {checkIn.bodyMd}
        </p>
      </div>
    );
  }

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
          {visibleCheckIns.map((checkIn) => (
            <CheckInRow key={checkIn.id} checkIn={checkIn} />
          ))}
          {earlierCheckIns.length > 0 ? (
            <details>
              <summary className="cursor-pointer list-none px-4 py-[11px] text-[13px] font-medium text-stone-600 transition hover:text-teal-700 [&::-webkit-details-marker]:hidden">
                Earlier · {earlierCheckIns.length} more, back to{" "}
                {formatShortDate(checkIns[checkIns.length - 1].createdAt)}
              </summary>
              <div className="divide-y divide-[#EEF1EC]">
                {earlierCheckIns.map((checkIn) => (
                  <CheckInRow key={checkIn.id} checkIn={checkIn} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}
