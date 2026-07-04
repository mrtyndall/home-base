import { Check } from "lucide-react";
import { completeRoutine } from "@/app/actions";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import type { getRoutinesWithState, RoutineSchedule } from "@/lib/routines";

type RoutineWithState = Awaited<
  ReturnType<typeof getRoutinesWithState>
>[number];

function scheduleFact(schedule: RoutineSchedule) {
  const cadence =
    schedule.frequency === "daily"
      ? "daily"
      : schedule.frequency === "weekly"
        ? "weekly"
        : schedule.days.join(", ");
  return schedule.timeWindow === "anytime"
    ? cadence
    : `${cadence} · ${schedule.timeWindow}`;
}

export function RoutinesView({ routines }: { routines: RoutineWithState[] }) {
  const active = routines.filter((routine) => routine.status === "active");
  const paused = routines.filter((routine) => routine.status === "paused");
  const retired = routines.filter((routine) => routine.status === "retired");

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Routines{" "}
        <span className="font-medium text-[#B0ACA2]">{active.length}</span>
      </h2>
      {active.length === 0 ? (
        <p className="text-sm text-[#6B7268]">No routines yet.</p>
      ) : (
        <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
          {active.map((routine) => (
            <RoutineCard key={routine.id} routine={routine} />
          ))}
        </div>
      )}
      {paused.length > 0 ? (
        <RoutineGroup title="Paused" routines={paused} />
      ) : null}
      {retired.length > 0 ? (
        <RoutineGroup title="Retired" routines={retired} />
      ) : null}
    </section>
  );
}

function RoutineGroup({
  title,
  routines,
}: {
  title: string;
  routines: RoutineWithState[];
}) {
  return (
    <details className="space-y-2">
      <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096] [&::-webkit-details-marker]:hidden">
        {title}{" "}
        <span className="font-medium normal-case text-[#B0ACA2]">
          {routines.length}
        </span>
      </summary>
      <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
        {routines.map((routine) => (
          <RoutineCard key={routine.id} routine={routine} />
        ))}
      </div>
    </details>
  );
}

function RoutineCard({ routine }: { routine: RoutineWithState }) {
  return (
    <details className="p-4">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-900">{routine.name}</p>
            <p className="mt-0.5 text-xs text-stone-500">
              {scheduleFact(routine.scheduleParsed)}
              {routine.area ? ` · ${routine.area.name}` : ""}
              {routine.status !== "active" ? ` · ${routine.status}` : ""}
            </p>
          </div>
          {routine.status === "active" && routine.dueToday ? (
            routine.satisfied ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-teal-700">
                <Check size={15} />
                {routine.completedToday ? "Done today" : "Done this week"}
              </span>
            ) : (
              <RoutineCompleteButton routineId={routine.id} />
            )
          ) : null}
        </div>
      </summary>
      <div className="mt-3 space-y-2 border-t border-[#EEF1EC] pt-3">
        {routine.description ? (
          <p className="text-sm text-stone-700">{routine.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
          {routine.startDate ? (
            <span>From {formatDateOnly(routine.startDate)}</span>
          ) : null}
          {routine.endDate ? (
            <span>Until {formatDateOnly(routine.endDate)}</span>
          ) : null}
          {routine.temporary ? <span>Temporary</span> : null}
          {routine.runLength > 0 ? (
            <span>
              Run: {routine.runLength}{" "}
              {routine.scheduleParsed.frequency === "weekly" ? "weeks" : "days"}
            </span>
          ) : null}
        </div>
        {routine.completions.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              History
            </p>
            <p className="mt-1 text-sm text-stone-600">
              {routine.completions
                .slice(0, 14)
                .map((completion) => formatShortDate(completion.completedAt))
                .join(" · ")}
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function RoutineCompleteButton({ routineId }: { routineId: string }) {
  return (
    <form action={completeRoutine}>
      <input type="hidden" name="routineId" value={routineId} />
      <button
        type="submit"
        title="Complete routine"
        className="grid h-9 w-9 place-items-center rounded-full border border-[#E2E6DF] bg-white text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
      >
        <Check size={16} />
      </button>
    </form>
  );
}
