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
  taskQuickEditPendingMessages,
  taskDatePresets,
  type TaskScheduleValue,
} from "@/lib/task-quick-edit";
import {
  LatestRequestCoordinator,
  type ChannelSnapshot,
  readRecentDestinationIds,
  runLatestRequest,
  writeRecentDestinationId,
} from "@/lib/task-quick-edit-coordinator";
import {
  TaskQuickEditMutationOwner as GenericTaskQuickEditMutationOwner,
} from "@/lib/task-quick-edit-mutation-owner";

type Destination = {
  id: string;
  type: "inbox" | "area" | "project";
  label: string;
  areaId: string | null;
  projectId: string | null;
};

export type LocationValue = {
  areaId: string | null;
  projectId: string | null;
  label: string;
};

type MutationPhase = "optimistic" | "committed" | "rolled-back" | "undo";

export type TaskQuickEditMutationEvent =
  | { taskId: string; channel: "location"; phase: MutationPhase; mutationId: number; value: LocationValue }
  | { taskId: string; channel: "schedule"; phase: MutationPhase; mutationId: number; value: TaskScheduleValue };
export type TaskQuickEditMutationOwner = GenericTaskQuickEditMutationOwner<TaskScheduleValue, LocationValue>;

export function createTaskQuickEditMutationOwner(schedule: TaskScheduleValue, location: LocationValue) {
  return new GenericTaskQuickEditMutationOwner(schedule, location, sameSchedule, sameLocation);
}

export function TaskQuickEdit({
  taskId,
  location,
  schedule,
  today,
  variant = "trigger",
  onMutation,
  mutationOwner,
}: {
  taskId: string;
  location: LocationValue;
  schedule: TaskScheduleValue;
  today: string;
  variant?: "facts" | "trigger" | "inbox";
  onMutation?: (event: TaskQuickEditMutationEvent) => void;
  mutationOwner?: TaskQuickEditMutationOwner;
}) {
  const dialogTitleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const locationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const scheduleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const requestCoordinator = useRef(new LatestRequestCoordinator());
  const destinationTaskId = useRef<string | null>(null);
  const internalMutationOwner = useRef(createTaskQuickEditMutationOwner(schedule, location)).current;
  const owner = mutationOwner ?? internalMutationOwner;
  const scheduleChannel = owner.scheduleChannel;
  const locationChannel = owner.locationChannel;
  const scheduleState = useSyncExternalStore(scheduleChannel.subscribe, scheduleChannel.snapshot, scheduleChannel.snapshot);
  const locationState = useSyncExternalStore(locationChannel.subscribe, locationChannel.snapshot, locationChannel.snapshot);
  const mounted = useSyncExternalStore(
    useCallback(() => () => {}, []),
    useCallback(() => true, []),
    useCallback(() => false, []),
  );
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"quick" | "move">("quick");
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [destinationsError, setDestinationsError] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [pickingDate, setPickingDate] = useState(false);

  useEffect(() => () => {
    requestCoordinator.current.cancel();
  }, []);

  useEffect(() => {
    scheduleChannel.reconcile(schedule);
  }, [schedule, scheduleChannel]);
  useEffect(() => {
    locationChannel.reconcile(location);
  }, [location, locationChannel]);
  useEffect(() => () => requestCoordinator.current.cancel(), [taskId]);

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("[data-dialog-initial]")?.focus(), 0);
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      opener?.focus();
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

  function showDialog(nextView: "quick" | "move" = "quick", opener = triggerRef.current) {
    openerRef.current = opener;
    setView(nextView);
    if (nextView === "move" && (destinations === null || destinationTaskId.current !== taskId)) void loadDestinations();
    setQuery("");
    setPickingDate(false);
    setOpen(true);
  }

  function openMoveView() {
    setView("move");
    if (destinations === null || destinationTaskId.current !== taskId) void loadDestinations();
    window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("[data-dialog-initial]")?.focus(), 0);
  }

  function openQuickView() {
    setView("quick");
    window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("[data-dialog-initial]")?.focus(), 0);
  }

  function closeDialog() {
    requestCoordinator.current.cancel();
    setDestinations(null);
    setOpen(false);
    setView("quick");
  }

  const loadDestinations = useCallback(async () => {
    destinationTaskId.current = taskId;
    setDestinations(null);
    setDestinationsError(false);
    try {
      const data = await runLatestRequest(requestCoordinator.current, async (signal) => {
        const response = await fetch(`/api/tasks/${taskId}/assignment-options`, { signal });
        if (!response.ok) throw new Error("Destination load failed");
        return response.json() as Promise<{ options?: Destination[] }>;
      });
      if (!data) return;
      setDestinations(data.options ?? []);
      setRecentIds(readRecentDestinationIds(safeStorage()));
    } catch {
      setDestinationsError(true);
    }
  }, [taskId]);

  async function writeSchedule(next: TaskScheduleValue) {
    const response = await fetch(`/api/tasks/${taskId}/schedule`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
    });
    if (!response.ok) throw new Error("Schedule update failed");
    const result = await response.json() as { task?: TaskScheduleValue };
    return result.task ?? next;
  }

  async function writeLocation(next: LocationValue) {
    const response = await fetch(`/api/tasks/${taskId}/assignment`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ areaId: next.areaId, projectId: next.projectId }),
    });
    if (!response.ok) throw new Error("Location update failed");
    const result = await response.json() as { task?: { areaId: string | null; projectId: string | null }; displayLabel?: string };
    return { areaId: result.task?.areaId ?? next.areaId, projectId: result.task?.projectId ?? next.projectId, label: result.displayLabel ?? next.label };
  }

  owner.bind({ taskId, writeSchedule, writeLocation, onMutation });
  if (variant === "inbox" && !mutationOwner) {
    throw new Error("Inbox TaskQuickEdit requires a mutationOwner mounted above the removable row");
  }

  async function changeSchedule(next: TaskScheduleValue) {
    if (sameSchedule(next, scheduleState.value)) {
      closeDialog();
      return;
    }
    closeDialog();
    await owner.mutateSchedule(next);
  }

  async function changeLocation(next: LocationValue) {
    if (sameLocation(next, locationState.value)) {
      closeDialog();
      return;
    }
    closeDialog();
    await owner.mutateLocation(next);
    if (locationChannel.snapshot().undo) {
      setRecentIds(writeRecentDestinationId(safeStorage(), next.projectId ?? next.areaId ?? "inbox"));
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
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={variant === "facts" ? "min-w-0" : "relative shrink-0"} data-task-control>
      {variant === "facts" ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <FactButton ref={locationTriggerRef} label="Location" value={locationState.value.label} icon={<FolderInput size={15} />} onClick={() => showDialog("move", locationTriggerRef.current)} />
          <FactButton ref={scheduleTriggerRef} label="Schedule" value={displayTaskSchedule(scheduleState.value)} icon={<CalendarDays size={15} />} onClick={() => showDialog("quick", scheduleTriggerRef.current)} />
        </div>
      ) : variant === "inbox" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            ref={locationTriggerRef}
            type="button"
            aria-label="Assign task"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-[#DDE5DD] px-3 text-sm font-medium text-stone-700"
            onClick={() => showDialog("move", locationTriggerRef.current)}
          >
            <FolderInput size={16} /><span>Assign</span>
          </button>
          <button
            ref={scheduleTriggerRef}
            type="button"
            aria-label="Schedule task"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-[#DDE5DD] px-3 text-sm font-medium text-stone-700"
            onClick={() => showDialog("quick", scheduleTriggerRef.current)}
          >
            <CalendarDays size={16} /><span>Schedule</span>
          </button>
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
            className="fixed inset-x-0 bottom-[var(--app-dock-clearance)] max-h-[calc(100dvh_-_var(--app-dock-clearance)_-_1rem)] min-w-0 overflow-y-auto overflow-x-hidden rounded-t-[24px] border border-[#E2E6DF] bg-[#FAFBF9] px-3 pb-3 pt-2 shadow-[0_-18px_48px_rgba(28,25,23,0.18)] transition motion-reduce:transition-none sm:static sm:w-[min(28rem,calc(100vw-3rem))] sm:max-h-[min(42rem,calc(100dvh-3rem))] sm:rounded-[20px] sm:p-3 sm:shadow-[0_18px_54px_rgba(28,25,23,0.20)]"
          >
            <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-stone-300 sm:hidden" />
            <div className="flex min-h-11 items-center gap-2 px-1">
              {view === "move" ? (
                <button type="button" aria-label="Back to quick edit" onClick={openQuickView} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"><ArrowLeft size={17} /></button>
              ) : null}
              <h2 id={dialogTitleId} className="min-w-0 flex-1 font-serif text-lg font-medium text-stone-950">
                {view === "move" ? "Move task" : "Quick edit"}
              </h2>
              <button type="button" aria-label="Close quick edit" onClick={closeDialog} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"><X size={17} /></button>
            </div>

            {view === "quick" ? (
              <div className="divide-y divide-[#E6EAE3] border-t border-[#E6EAE3]">
                {presets.slice(0, 4).map((preset, index) => (
                  <Choice initial={index === 0} key={preset.key} selected={sameSchedule(preset.value, scheduleState.value)} onClick={() => void changeSchedule(preset.value)}>{preset.label}</Choice>
                ))}
                <Choice selected={false} onClick={() => setPickingDate((value) => !value)}>Pick date</Choice>
                {pickingDate ? (
                  <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm text-stone-700">
                    <span className="shrink-0">Choose date</span>
                    <input type="date" autoFocus className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#D7DDD4] bg-white px-3 outline-none focus:border-teal-700" onChange={(event) => { if (event.target.value) void changeSchedule({ dueDate: event.target.value, someday: false }); }} />
                  </label>
                ) : null}
                {presets.slice(4).map((preset) => (
                  <Choice key={preset.key} selected={sameSchedule(preset.value, scheduleState.value)} onClick={() => void changeSchedule(preset.value)}>{preset.label}</Choice>
                ))}
                <Choice selected={false} onClick={openMoveView}><span className="flex items-center gap-2"><FolderInput size={15} />Move task<span className="ml-auto max-w-[65%] break-words text-right text-xs text-stone-500 [overflow-wrap:anywhere]">{locationState.value.label}</span></span></Choice>
              </div>
            ) : (
              <div className="min-w-0 border-t border-[#E6EAE3] pt-2">
                <label className="flex min-h-11 items-center gap-2 rounded-[12px] border border-[#DDE5DD] bg-white px-3 text-stone-500 focus-within:border-teal-700 focus-within:ring-2 focus-within:ring-teal-700/15">
                  <Search size={15} />
                  <span className="sr-only">Search destinations</span>
                  <input data-dialog-initial value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Areas and Projects" className="h-11 min-w-0 flex-1 bg-transparent text-base text-stone-950 outline-none placeholder:text-stone-400" />
                </label>
                {destinations === null && !destinationsError ? <p role="status" className="px-3 py-4 text-sm text-stone-500">Loading destinations…</p> : null}
                {destinationsError ? <div role="alert" className="flex min-h-11 items-center justify-between gap-3 px-3 text-sm text-stone-700"><span>Couldn’t load destinations</span><button type="button" onClick={() => void loadDestinations()} className="min-h-11 font-semibold text-teal-800">Retry</button></div> : null}
                <div className="divide-y divide-[#E6EAE3]">
                  {visibleDestinations.map((destination) => (
                    <Choice key={`${destination.type}:${destination.id}`} selected={destination.areaId === locationState.value.areaId && destination.projectId === locationState.value.projectId} onClick={() => void changeLocation({ areaId: destination.areaId, projectId: destination.projectId, label: destination.label })}>
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

      {mounted && variant !== "inbox"
        ? <TaskQuickEditMutationStatusHost mutationOwner={owner} />
        : null}
    </div>
  );
}

function FactButton({ label, value, icon, onClick, ref }: { label: string; value: string; icon: ReactNode; onClick: () => void; ref?: React.Ref<HTMLButtonElement> }) {
  return <button ref={ref} type="button" onClick={onClick} className="flex min-h-11 min-w-0 items-center gap-2 rounded-[12px] border border-[#DDE5DD] bg-[#F7FAF5] px-3 text-left transition hover:border-teal-700/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 motion-reduce:transition-none"><span className="shrink-0 text-teal-700">{icon}</span><span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">{label}</span><span className="block break-words text-[13px] font-medium text-stone-800 [overflow-wrap:anywhere]">{value}</span></span></button>;
}

function Choice({ selected, onClick, children, initial = false }: { selected: boolean; onClick: () => void; children: ReactNode; initial?: boolean }) {
  return <button data-dialog-initial={initial ? "" : undefined} type="button" onClick={onClick} className="flex min-h-11 w-full min-w-0 items-center gap-3 px-3 py-1.5 text-left text-sm text-stone-800 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700 motion-reduce:transition-none"><span className="min-w-0 flex-1">{children}</span>{selected ? <Check aria-label="Selected" className="shrink-0 text-teal-700" size={17} /> : null}</button>;
}

function sameSchedule(a: TaskScheduleValue, b: TaskScheduleValue) {
  return a.dueDate === b.dueDate && a.someday === b.someday;
}

function sameLocation(a: LocationValue, b: LocationValue) {
  return a.areaId === b.areaId && a.projectId === b.projectId;
}

function safeStorage() {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function TaskQuickEditMutationStatusHost({ mutationOwner }: {
  mutationOwner: TaskQuickEditMutationOwner;
}) {
  return <TaskQuickEditMutationStatusStack mutationOwners={[mutationOwner]} />;
}

export function TaskQuickEditMutationStatusStack({ mutationOwners }: {
  mutationOwners: TaskQuickEditMutationOwner[];
}) {
  const mounted = useSyncExternalStore(
    useCallback(() => () => {}, []),
    useCallback(() => true, []),
    useCallback(() => false, []),
  );

  if (!mounted) return null;
  return createPortal(
    <div
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(var(--app-dock-clearance)+0.75rem)] z-[80] mx-auto flex max-w-md flex-col gap-2 sm:bottom-6"
    >
      {mutationOwners.map((mutationOwner, index) => (
        <TaskQuickEditMutationStatusItem
          key={index}
          mutationOwner={mutationOwner}
        />
      ))}
    </div>,
    document.body,
  );
}

function TaskQuickEditMutationStatusItem({ mutationOwner }: {
  mutationOwner: TaskQuickEditMutationOwner;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const schedule = useSyncExternalStore(
    mutationOwner.scheduleChannel.subscribe,
    mutationOwner.scheduleChannel.snapshot,
    mutationOwner.scheduleChannel.snapshot,
  );
  const location = useSyncExternalStore(
    mutationOwner.locationChannel.subscribe,
    mutationOwner.locationChannel.snapshot,
    mutationOwner.locationChannel.snapshot,
  );
  useEffect(() => {
    if (!schedule.undo) return;
    const timer = window.setTimeout(() => {
      mutationOwner.scheduleChannel.clearUndo();
      startTransition(() => router.refresh());
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [mutationOwner, router, schedule.undo, startTransition]);

  useEffect(() => {
    if (!location.undo) return;
    const timer = window.setTimeout(() => {
      mutationOwner.locationChannel.clearUndo();
      startTransition(() => router.refresh());
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [location.undo, mutationOwner, router, startTransition]);

  return <TaskQuickEditStatus
    schedule={schedule}
    location={location}
    onRetrySchedule={() => void mutationOwner.retrySchedule()}
    onRetryLocation={() => void mutationOwner.retryLocation()}
    onUndoSchedule={() => void mutationOwner.undoSchedule().then(() => startTransition(() => router.refresh()))}
    onUndoLocation={() => void mutationOwner.undoLocation().then(() => startTransition(() => router.refresh()))}
  />;
}

function TaskQuickEditStatus({ schedule, location, onRetrySchedule, onRetryLocation, onUndoSchedule, onUndoLocation }: {
  schedule: ChannelSnapshot<TaskScheduleValue>;
  location: ChannelSnapshot<LocationValue>;
  onRetrySchedule: () => void;
  onRetryLocation: () => void;
  onUndoSchedule: () => void;
  onUndoLocation: () => void;
}) {
  const pendingMessages = taskQuickEditPendingMessages({
    schedule: schedule.pending,
    location: location.pending,
  });
  const errors = [
    schedule.error ? { key: "schedule", retry: onRetrySchedule } : null,
    location.error ? { key: "location", retry: onRetryLocation } : null,
  ].filter((item): item is { key: string; retry: () => void } => item !== null);
  const undos = [
    schedule.undo ? { key: "schedule", undo: onUndoSchedule } : null,
    location.undo ? { key: "location", undo: onUndoLocation } : null,
  ].filter((item): item is { key: string; undo: () => void } => item !== null);
  if (pendingMessages.length === 0 && errors.length === 0 && undos.length === 0) return null;
  return (
    <>
      {pendingMessages.map((message) => <div key={message} role="status" className="min-h-11 rounded-[14px] border border-[#DDE5DD] bg-[#F7FAF5] px-4 py-3 text-sm text-stone-800 shadow-lg">{message}</div>)}
      {errors.map((item) => <div key={item.key} role="alert" className="flex min-h-11 items-center gap-3 rounded-[14px] border border-[#DDE5DD] bg-[#F7FAF5] px-4 text-sm text-stone-800 shadow-lg"><span className="min-w-0 flex-1">Couldn’t update task</span><button type="button" onClick={item.retry} className="min-h-11 shrink-0 font-semibold text-teal-800">Retry</button></div>)}
      {undos.map((item) => <div key={item.key} role="status" className="flex min-h-11 items-center gap-4 rounded-[14px] bg-stone-900 px-4 text-sm text-white shadow-lg"><span className="min-w-0 flex-1">Task updated</span><button type="button" onClick={item.undo} className="min-h-11 font-semibold text-teal-200">Undo</button></div>)}
    </>
  );
}
