import { Check } from "lucide-react";
import { completeRoutine } from "@/app/actions";
import type { RoutineTimeWindow } from "@/lib/routines";

export type TodayRoutineItem = {
  id: string;
  name: string;
  timeWindow: RoutineTimeWindow;
  completedToday: boolean;
};

export function TodayRoutinesLine({
  routines,
}: {
  routines: TodayRoutineItem[];
}) {
  if (routines.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Routines
      </h2>
      <div className="flex flex-wrap gap-2">
        {routines.map((routine) =>
          routine.completedToday ? (
            <span
              key={routine.id}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-teal-700/30 bg-white px-3 text-sm text-teal-800"
            >
              <Check size={14} />
              {routine.name}
            </span>
          ) : (
            <form key={routine.id} action={completeRoutine}>
              <input type="hidden" name="routineId" value={routine.id} />
              <button
                type="submit"
                title={`Complete ${routine.name}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3 text-sm text-stone-700 transition hover:border-teal-700/50 hover:text-teal-700"
              >
                {routine.name}
                {routine.timeWindow !== "anytime" ? (
                  <span className="text-xs text-stone-500">
                    {routine.timeWindow}
                  </span>
                ) : null}
              </button>
            </form>
          ),
        )}
      </div>
    </section>
  );
}
