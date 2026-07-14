"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  FolderInput,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  displayTaskSchedule,
  taskDatePresets,
  type TaskScheduleValue,
} from "@/lib/task-quick-edit";

type Destination = {
  id: string;
  type: "inbox" | "area" | "project";
  label: string;
  areaId: string | null;
  projectId: string | null;
};

type LocationValue = {
  areaId: string | null;
  projectId: string | null;
  label: string;
};

type RetryAction =
  | { kind: "schedule"; next: TaskScheduleValue; previous: TaskScheduleValue }
  | { kind: "location"; next: LocationValue; previous: LocationValue };

const recentStorageKey = "home-base:task-quick-edit:recent-destinations";

export function TaskQuickEdit({
  taskId,
  location,
  schedule,
  today,
  variant = "trigger",
}: {
  taskId: string;
  location: LocationValue;
  schedule: TaskScheduleValue;
  today: string;
  variant?: "facts" | "trigger";
}) {
  const router = useRouter();
  const dialogTitleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const operationToken = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useSyncExternalStore(
    useCallback(() => () => {}, []),
    useCallback(() => true, []),
    useCallback(() => false, []),
  );
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"quick" | "move">("quick");
  const [locationValue, setLocationValue] = useState(location);
  const [scheduleValue, setScheduleValue] = useState(schedule);
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [destinationsError, setDestinationsError] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [pickingDate, setPickingDate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const [undoAction, setUndoAction] = useState<RetryAction | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const trigger = triggerRef.current;
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      (trigger ?? previous)?.focus?.();
    };
  }, [open]);

  const presets = useMemo(() => taskDatePresets(today), [today]);
  const visibleDestinations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const options = destinations ?? [];
    const ranked = [...options].sort((a, b) => {
      const aRecent = recentIds.indexOf(a.id);
      const bRecent = recentIds.indexOf(b.id);
      if (aRecent >= 0 || bRecent >= 0) {
        if (aRecent < 0) return 1;
        if (bRecent < 0) return -1;
        return aRecent - bRecent;
      }
      if (a.type === "inbox") return -1;
      if (b.type === "inbox") return 1;
      return a.label.localeCompare(b.label);
    });
    return normalized
      ? ranked.filter((option) => option.label.toLocaleLowerCase().includes(normalized))
      : ranked;
  }, [destinations, query, recentIds]);

  function showDialog(nextView: "quick" | "move" = "quick") {
    setView(nextView);
    if (nextView === "move" && destinations === null) void loadDestinations();
    setQuery("");
    setPickingDate(false);
    setOpen(true);
  }

  function openMoveView() {
    setView("move");
    if (destinations === null) void loadDestinations();
  }

  function closeDialog() {
    setOpen(false);
    setView("quick");
  }

  const loadDestinations = useCallback(async () => {
    setDestinationsError(false);
    try {
      const response = await fetch(`/api/tasks/${taskId}/assignment-options`);
      if (!response.ok) throw new Error("Destination load failed");
      const data = await response.json() as { options?: Destination[] };
      setDestinations(data.options ?? []);
      setRecentIds(readRecentIds());
    } catch {
      setDestinationsError(true);
    }
  }, [taskId]);

  function armUndo(action: RetryAction) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoAction(action);
    undoTimer.current = setTimeout(() => setUndoAction(null), 6000);
  }

  async function changeSchedule(next: TaskScheduleValue, previous = scheduleValue) {
    if (next.dueDate === scheduleValue.dueDate && next.someday === scheduleValue.someday) {
      closeDialog();
      return;
    }
    const action: RetryAction = { kind: "schedule", next, previous };
    const token = ++operationToken.current;
    setScheduleValue(next);
    setError(null);
    setRetryAction(null);
    closeDialog();
    try {
      const response = await fetch(`/api/tasks/${taskId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Schedule update failed");
      const result = await response.json() as { task?: TaskScheduleValue };
      if (operationToken.current !== token) return;
      setScheduleValue(result.task ?? next);
      armUndo(action);
      startTransition(() => router.refresh());
    } catch {
      if (operationToken.current !== token) return;
      setScheduleValue(previous);
      setError("Couldn’t update task");
      setRetryAction(action);
    }
  }

  async function changeLocation(next: LocationValue, previous = locationValue) {
    if (next.areaId === locationValue.areaId && next.projectId === locationValue.projectId) {
      closeDialog();
      return;
    }
    const action: RetryAction = { kind: "location", next, previous };
    const token = ++operationToken.current;
    setLocationValue(next);
    setError(null);
    setRetryAction(null);
    closeDialog();
    try {
      const response = await fetch(`/api/tasks/${taskId}/assignment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaId: next.areaId, projectId: next.projectId }),
      });
      if (!response.ok) throw new Error("Location update failed");
      const result = await response.json() as {
        task?: { areaId: string | null; projectId: string | null };
        displayLabel?: string;
      };
      if (operationToken.current !== token) return;
      const authoritative = {
        areaId: result.task?.areaId ?? next.areaId,
        projectId: result.task?.projectId ?? next.projectId,
        label: result.displayLabel ?? next.label,
      };
      setLocationValue(authoritative);
      rememberDestination(next.projectId ?? next.areaId ?? "inbox");
      setRecentIds(readRecentIds());
      armUndo({ ...action, next: authoritative });
      startTransition(() => router.refresh());
    } catch {
      if (operationToken.current !== token) return;
      setLocationValue(previous);
      setError("Couldn’t update task");
      setRetryAction(action);
    }
  }

  function retry() {
    if (!retryAction) return;
    if (retryAction.kind === "schedule") {
      void changeSchedule(retryAction.next, retryAction.previous);
    } else {
      void changeLocation(retryAction.next, retryAction.previous);
    }
  }

  function undo() {
    const action = undoAction;
    if (!action) return;
    setUndoAction(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (action.kind === "schedule") {
      void changeSchedule(action.previous, action.next);
    } else {
      void changeLocation(action.previous, action.next);
    }
  }

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={variant === "facts" ? "min-w-0" : "relative shrink-0"} data-task-control>
      {variant === "facts" ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <FactButton ref={triggerRef} label="Location" value={locationValue.label} icon={<FolderInput size={15} />} onClick={() => showDialog("move")} />
          <FactButton label="Schedule" value={displayTaskSchedule(scheduleValue)} icon={<CalendarDays size={15} />} onClick={() => showDialog("quick")} />
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          title="Quick edit task"
          aria-label="Quick edit task"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => showDialog()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#E2E6DF] bg-white text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 motion-reduce:transition-none"
        >
          <SlidersHorizontal size={16} />
        </button>
      )}

      {error ? (
        <div role="alert" className="mt-2 flex min-h-11 items-center gap-2 rounded-[12px] border border-[#DDE5DD] bg-[#F7FAF5] px-3 text-[13px] text-stone-700">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={retry} className="min-h-11 shrink-0 font-semibold text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700">Retry</button>
        </div>
      ) : null}

      {mounted && open ? createPortal(
        <div className="fixed inset-0 z-[70] bg-stone-950/20 sm:grid sm:place-items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Quick edit task"
            aria-labelledby={dialogTitleId}
            tabIndex={-1}
            onKeyDown={keepFocusInside}
            className="fixed inset-x-0 bottom-0 max-h-[calc(100dvh-4rem)] min-w-0 overflow-y-auto overflow-x-hidden rounded-t-[24px] border border-[#E2E6DF] bg-[#FAFBF9] px-3 pt-2 shadow-[0_-18px_48px_rgba(28,25,23,0.18)] transition motion-reduce:transition-none sm:static sm:w-[min(28rem,calc(100vw-3rem))] sm:max-h-[min(42rem,calc(100dvh-3rem))] sm:rounded-[20px] sm:p-3 sm:shadow-[0_18px_54px_rgba(28,25,23,0.20)] [padding-bottom:calc(var(--app-bottom-clearance,5.5rem)+env(safe-area-inset-bottom))] sm:[padding-bottom:0.75rem]"
          >
            <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-stone-300 sm:hidden" />
            <div className="flex min-h-11 items-center gap-2 px-1">
              {view === "move" ? (
                <button type="button" aria-label="Back to quick edit" onClick={() => setView("quick")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"><ArrowLeft size={17} /></button>
              ) : null}
              <h2 id={dialogTitleId} className="min-w-0 flex-1 font-serif text-lg font-medium text-stone-950">
                {view === "move" ? "Move task" : "Quick edit"}
              </h2>
              <button type="button" aria-label="Close quick edit" onClick={closeDialog} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"><X size={17} /></button>
            </div>

            {view === "quick" ? (
              <div className="divide-y divide-[#E6EAE3] border-t border-[#E6EAE3]">
                {presets.slice(0, 4).map((preset) => (
                  <Choice key={preset.key} selected={sameSchedule(preset.value, scheduleValue)} onClick={() => void changeSchedule(preset.value)}>{preset.label}</Choice>
                ))}
                <Choice selected={false} onClick={() => setPickingDate((value) => !value)}>Pick date</Choice>
                {pickingDate ? (
                  <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm text-stone-700">
                    <span className="shrink-0">Choose date</span>
                    <input type="date" autoFocus className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#D7DDD4] bg-white px-3 outline-none focus:border-teal-700" onChange={(event) => { if (event.target.value) void changeSchedule({ dueDate: event.target.value, someday: false }); }} />
                  </label>
                ) : null}
                {presets.slice(4).map((preset) => (
                  <Choice key={preset.key} selected={sameSchedule(preset.value, scheduleValue)} onClick={() => void changeSchedule(preset.value)}>{preset.label}</Choice>
                ))}
                <Choice selected={false} onClick={openMoveView}><span className="flex items-center gap-2"><FolderInput size={15} />Move task<span className="ml-auto max-w-[65%] break-words text-right text-xs text-stone-500 [overflow-wrap:anywhere]">{locationValue.label}</span></span></Choice>
              </div>
            ) : (
              <div className="min-w-0 border-t border-[#E6EAE3] pt-2">
                <label className="flex min-h-11 items-center gap-2 rounded-[12px] border border-[#DDE5DD] bg-white px-3 text-stone-500 focus-within:border-teal-700 focus-within:ring-2 focus-within:ring-teal-700/15">
                  <Search size={15} />
                  <span className="sr-only">Search destinations</span>
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Areas and Projects" className="h-11 min-w-0 flex-1 bg-transparent text-base text-stone-950 outline-none placeholder:text-stone-400" />
                </label>
                {destinations === null && !destinationsError ? <p role="status" className="px-3 py-4 text-sm text-stone-500">Loading destinations…</p> : null}
                {destinationsError ? <div role="alert" className="flex min-h-11 items-center justify-between gap-3 px-3 text-sm text-stone-700"><span>Couldn’t load destinations</span><button type="button" onClick={() => void loadDestinations()} className="min-h-11 font-semibold text-teal-800">Retry</button></div> : null}
                <div className="divide-y divide-[#E6EAE3]">
                  {visibleDestinations.map((destination) => (
                    <Choice key={`${destination.type}:${destination.id}`} selected={destination.areaId === locationValue.areaId && destination.projectId === locationValue.projectId} onClick={() => void changeLocation({ areaId: destination.areaId, projectId: destination.projectId, label: destination.label })}>
                      <span className="block break-words py-1 [overflow-wrap:anywhere]">{destination.label}</span>
                    </Choice>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      ) : null}

      {mounted && undoAction ? createPortal(
        <div role="status" aria-live="polite" className="fixed bottom-[calc(var(--app-bottom-clearance,5.5rem)+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-[80] flex min-h-11 -translate-x-1/2 items-center gap-4 rounded-full bg-stone-900 px-4 text-sm text-white shadow-lg sm:bottom-6">
          <span>Task updated</span>
          <button type="button" onClick={undo} className="min-h-11 font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Undo</button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function FactButton({ label, value, icon, onClick, ref }: { label: string; value: string; icon: ReactNode; onClick: () => void; ref?: React.Ref<HTMLButtonElement> }) {
  return <button ref={ref} type="button" onClick={onClick} className="flex min-h-11 min-w-0 items-center gap-2 rounded-[12px] border border-[#DDE5DD] bg-[#F7FAF5] px-3 text-left transition hover:border-teal-700/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 motion-reduce:transition-none"><span className="shrink-0 text-teal-700">{icon}</span><span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">{label}</span><span className="block break-words text-[13px] font-medium text-stone-800 [overflow-wrap:anywhere]">{value}</span></span></button>;
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="flex min-h-11 w-full min-w-0 items-center gap-3 px-3 py-1.5 text-left text-sm text-stone-800 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700 motion-reduce:transition-none"><span className="min-w-0 flex-1">{children}</span>{selected ? <Check aria-label="Selected" className="shrink-0 text-teal-700" size={17} /> : null}</button>;
}

function sameSchedule(a: TaskScheduleValue, b: TaskScheduleValue) {
  return a.dueDate === b.dueDate && a.someday === b.someday;
}

function readRecentIds() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const value = JSON.parse(localStorage.getItem(recentStorageKey) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberDestination(id: string) {
  if (typeof window === "undefined") return;
  const ids = [id, ...readRecentIds().filter((candidate) => candidate !== id)].slice(0, 5);
  localStorage.setItem(recentStorageKey, JSON.stringify(ids));
}
