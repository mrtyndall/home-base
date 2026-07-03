import { Check, Repeat } from "lucide-react";
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
    <section className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-stone-800">
        <Repeat size={16} />
        <h2 className="text-sm font-semibold">Routines</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {routines.map((routine) =>
          routine.completedToday ? (
            <span
              key={routine.id}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-3 text-sm text-teal-800"
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
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
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
