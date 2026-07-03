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
    <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-stone-800">Check-ins</h2>
        <CheckInComposer parentType={parentType} parentId={parentId} />
      </div>
      {checkIns.length === 0 ? null : (
        <div className="divide-y divide-stone-100">
          {checkIns.map((checkIn) => (
            <div key={checkIn.id} className="py-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800">
                {checkIn.bodyMd}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {formatShortDate(checkIn.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
