import { Check } from "lucide-react";
import { completeRoutine, undoRoutineCompletion } from "@/app/actions";
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
            <form key={routine.id} action={undoRoutineCompletion}>
              <input type="hidden" name="routineId" value={routine.id} />
              <button
                type="submit"
                title={`Uncheck ${routine.name}`}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm text-teal-700 transition hover:border-teal-700/50"
              >
                <Check size={13} />
                {routine.name}
              </button>
            </form>
          ) : (
            <form key={routine.id} action={completeRoutine}>
              <input type="hidden" name="routineId" value={routine.id} />
              <button
                type="submit"
                title={`Complete ${routine.name}`}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm text-stone-700 transition hover:border-teal-700/50 hover:text-teal-700"
              >
                {routine.name}
                {routine.timeWindow !== "anytime" ? (
                  <span className="text-xs text-[#9AA096]">
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
