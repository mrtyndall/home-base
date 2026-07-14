"use client";

import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, GripVertical } from "lucide-react";
import { getTaskDragPreviewPosition } from "@/lib/task-drag-preview";

const dragStartEvent = "home-base-task-drag-start";
const dragHoverEvent = "home-base-task-drag-hover";
const dragEndEvent = "home-base-task-drag-end";

type TaskDragPreview = {
  title: string;
  detail: string;
};

type TaskDragPreviewPosition = {
  left: number;
  top: number;
};

type TaskDragHover = {
  dropKey?: string | null;
  targetTaskId?: string | null;
};

type TaskDropKind = "date" | "someday" | "unscheduled";

function taskDropKey(kind: TaskDropKind, date?: string | null) {
  return kind === "date" ? `date:${date ?? ""}` : kind;
}

function announceTaskDragStart(preview: TaskDragPreview) {
  window.dispatchEvent(new CustomEvent(dragStartEvent, { detail: preview }));
}

function announceTaskDragHover(detail: TaskDragHover) {
  window.dispatchEvent(new CustomEvent(dragHoverEvent, { detail }));
}

function announceTaskDragEnd() {
  announceTaskDragHover({ dropKey: null, targetTaskId: null });
  window.dispatchEvent(new Event(dragEndEvent));
}

type TaskDropZoneProps = {
  targetDate: string | null;
  targetKind?: TaskDropKind;
  label?: string;
  isEmpty: boolean;
  emptyText: string;
  children: ReactNode;
};

type DraggableTaskLinkProps = {
  taskId: string;
  href: string;
  title: string;
  detail: string;
  currentDueDate: string | null;
  currentParentTaskId?: string | null;
  currentAreaId?: string;
  currentProjectId?: string | null;
  areaGroups?: Array<{
    domainName: string;
    areas: Array<{ id: string; name: string }>;
  }>;
  projects?: Array<{
    id: string;
    name: string;
    areaId: string;
    areaName: string;
  }>;
  today: string;
  tomorrow: string;
};

export function TaskDropZone({
  targetDate,
  targetKind,
  label = "section",
  isEmpty,
  emptyText,
  children,
}: TaskDropZoneProps) {
  const [draggingTask, setDraggingTask] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [preview, setPreview] = useState<TaskDragPreview | null>(null);

  useEffect(() => {
    const kind = targetKind ?? (targetDate ? "date" : "unscheduled");
    const zoneKey = taskDropKey(kind, targetDate);
    const handleDragStart = (event: Event) => {
      setDraggingTask(true);
      setPreview(
        event instanceof CustomEvent ? (event.detail as TaskDragPreview) : null,
      );
    };
    const handleDragHover = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as TaskDragHover;
      setIsActive(detail.dropKey === zoneKey);
    };
    const handleDragEnd = () => {
      setDraggingTask(false);
      setIsActive(false);
      setPreview(null);
    };
    window.addEventListener(dragStartEvent, handleDragStart);
    window.addEventListener(dragHoverEvent, handleDragHover);
    window.addEventListener(dragEndEvent, handleDragEnd);
    return () => {
      window.removeEventListener(dragStartEvent, handleDragStart);
      window.removeEventListener(dragHoverEvent, handleDragHover);
      window.removeEventListener(dragEndEvent, handleDragEnd);
    };
  }, [targetDate, targetKind]);

  const kind = targetKind ?? (targetDate ? "date" : "unscheduled");

  return (
    <div
      data-drop-date={targetDate ?? ""}
      data-drop-kind={kind}
      data-drop-key={taskDropKey(kind, targetDate)}
      className={`relative ${isEmpty ? "min-h-0 sm:min-h-20" : "min-h-20"} ${draggingTask ? "min-h-20" : ""} space-y-2 rounded-[14px] border p-1.5 transition ${
        isActive
          ? "border-teal-700 bg-teal-700/5"
          : draggingTask
            ? "border-dashed border-teal-700/40 bg-white/50"
            : "border-transparent"
      }`}
    >
      {draggingTask ? (
        <div
          className={`mb-2 inline-flex h-[30px] items-center rounded-full px-3 text-[13px] font-medium transition ${
            isActive
              ? "bg-teal-700 text-white"
              : "border border-teal-700/40 bg-white text-teal-800"
          }`}
        >
          Drop into {label}
        </div>
      ) : null}
      {draggingTask && isActive && preview ? (
        <div className="mb-2 rounded-[12px] border border-teal-700/50 bg-white p-3.5 shadow-[0_4px_14px_rgba(28,25,23,0.10)]">
          <h3 className="text-sm font-medium text-stone-950">
            {preview.title}
          </h3>
          <p className="mt-0.5 text-xs text-[#9AA096]">{preview.detail}</p>
        </div>
      ) : null}
      <div
        data-task-drop-list
        className={`${draggingTask ? "space-y-2" : ""}`}
      >
        {isEmpty ? (
          <p className="px-2.5 py-2 text-sm text-[#6B7268]">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function DraggableTaskLink({
  taskId,
  href,
  title,
  detail,
  currentDueDate,
  currentParentTaskId = null,
  currentAreaId = "",
  currentProjectId = null,
  areaGroups = [],
  projects = [],
  today,
  tomorrow,
}: DraggableTaskLinkProps) {
  const router = useRouter();
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerDragging = useRef(false);
  const dragAnnounced = useRef(false);
  const suppressNextClick = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragPending, setDragPending] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [dragPreviewPosition, setDragPreviewPosition] =
    useState<TaskDragPreviewPosition | null>(null);
  const [, startTransition] = useTransition();
  const currentParentKey = currentParentTaskId ?? "";

  useEffect(() => {
    const handleDragHover = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as TaskDragHover;
      setIsDropTarget(detail.targetTaskId === taskId);
    };
    const handleDragEnd = () => setIsDropTarget(false);
    window.addEventListener(dragHoverEvent, handleDragHover);
    window.addEventListener(dragEndEvent, handleDragEnd);
    return () => {
      window.removeEventListener(dragHoverEvent, handleDragHover);
      window.removeEventListener(dragEndEvent, handleDragEnd);
    };
  }, [taskId]);

  function moveDragPreview(clientX: number, clientY: number) {
    if (clientX === 0 && clientY === 0) return;
    setDragPreviewPosition(getTaskDragPreviewPosition(clientX, clientY));
  }

  function markDragStarted(clientX?: number, clientY?: number) {
    if (dragAnnounced.current) return;
    dragAnnounced.current = true;
    if (clientX !== undefined && clientY !== undefined) {
      moveDragPreview(clientX, clientY);
    }
    announceTaskDragStart({ title, detail });
  }

  function markDragEnded() {
    if (!dragAnnounced.current) return;
    dragAnnounced.current = false;
    setDragPreviewPosition(null);
    announceTaskDragEnd();
  }

  function isTaskDragHandle(target: EventTarget | null) {
    return target instanceof HTMLElement
      ? Boolean(target.closest("[data-task-drag-handle]"))
      : false;
  }

  function isInteractiveTaskControl(target: EventTarget | null) {
    return target instanceof HTMLElement
      ? Boolean(
          target.closest(
            "button,input,select,textarea,summary,[data-task-control]",
          ),
        )
      : false;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isInteractiveTaskControl(event.target)) return;
    if (event.pointerType === "touch" && !isTaskDragHandle(event.target)) {
      return;
    }
    setMenuOpen(false);
    pointerStart.current = { x: event.clientX, y: event.clientY };
    pointerDragging.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current) return;
    const distance = Math.hypot(
      event.clientX - pointerStart.current.x,
      event.clientY - pointerStart.current.y,
    );
    if (distance > 8) {
      pointerDragging.current = true;
      suppressNextClick.current = true;
      event.preventDefault();
      moveDragPreview(event.clientX, event.clientY);
      markDragStarted(event.clientX, event.clientY);
      announceHoverTarget(event.clientX, event.clientY);
    }
  }

  function announceHoverTarget(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY);
    const taskTarget = element?.closest<HTMLElement>("[data-task-id]");
    const targetParentKey = taskTarget?.dataset.taskParentId ?? "";
    const targetTaskId =
      taskTarget?.dataset.taskId === taskId ||
      targetParentKey !== currentParentKey
        ? null
        : taskTarget?.dataset.taskId;
    const dropTarget = element?.closest<HTMLElement>("[data-drop-date]");
    announceTaskDragHover({
      targetTaskId: targetTaskId ?? null,
      dropKey: dropTarget?.dataset.dropKey ?? null,
    });
  }

  async function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const wasDragging = pointerDragging.current;
    pointerStart.current = null;
    pointerDragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!wasDragging) return;

    const taskTarget = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-task-id]");
    const targetParentKey = taskTarget?.dataset.taskParentId ?? "";
    const targetTaskId =
      targetParentKey === currentParentKey ? taskTarget?.dataset.taskId : null;
    const dropTarget = taskTarget
      ? null
      : document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-drop-date]");
    const targetKind = dropTarget?.dataset.dropKind as TaskDropKind | undefined;
    const targetDateValue = dropTarget?.dataset.dropDate;
    const targetDropKey = dropTarget?.dataset.dropKey;
    markDragEnded();
    if (!targetTaskId && !targetKind) return;
    if (targetTaskId === taskId) return;

    event.preventDefault();
    if (targetTaskId && targetTaskId !== taskId) {
      moveTaskCardOptimistically(taskId, targetTaskId);
    } else if (targetDropKey) {
      moveTaskCardToDropZoneOptimistically(taskId, targetDropKey);
    }
    setDragPending(true);
    try {
      if (targetTaskId && targetTaskId !== taskId) {
        await updateTaskOrder(taskId, { targetTaskId });
      } else if (targetKind === "someday") {
        await updateTaskSchedule(taskId, { someday: true });
      } else {
        await updateTaskSchedule(taskId, {
          dueDate: targetKind === "date" ? (targetDateValue ?? null) : null,
        });
      }
      startTransition(() => router.refresh());
    } finally {
      setDragPending(false);
    }
  }

  return (
    <>
      {isDropTarget ? (
        <div className="mb-1 h-1.5 rounded-full bg-teal-700/70" />
      ) : null}
      <div
        data-task-id={taskId}
        data-task-parent-id={currentParentKey}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`-m-1 flex min-w-0 flex-1 cursor-grab items-start gap-2 rounded-[10px] p-1 transition hover:bg-[#F7F9F5] active:cursor-grabbing ${
          dragPending ? "opacity-60" : ""
        } ${dragPreviewPosition ? "pointer-events-none opacity-50" : ""} ${
          isDropTarget ? "bg-teal-700/5 ring-1 ring-teal-700/40" : ""
        }`}
      >
        <span
          aria-label="Drag task"
          data-task-drag-handle
          className="mt-0.5 grid h-9 w-9 shrink-0 cursor-grab touch-none place-items-center rounded-full text-[#B0B7AD] transition hover:bg-[#EEF1EC] hover:text-teal-700 active:cursor-grabbing sm:h-8 sm:w-8"
        >
          <GripVertical aria-hidden="true" size={16} />
        </span>
        <Link
          href={href}
          onClickCapture={(event) => {
            if (!suppressNextClick.current) return;
            event.preventDefault();
            event.stopPropagation();
            suppressNextClick.current = false;
          }}
          className="min-w-0 flex-1"
        >
          <h3 className="text-[15px] font-medium">{title}</h3>
          <p className="mt-0.5 text-[13px] text-stone-500">{detail}</p>
        </Link>
        <ScheduleMenu
          taskId={taskId}
          currentDueDate={currentDueDate}
          currentAreaId={currentAreaId}
          currentProjectId={currentProjectId}
          areaGroups={areaGroups}
          projects={projects}
          today={today}
          tomorrow={tomorrow}
          open={menuOpen}
          setOpen={setMenuOpen}
        />
      </div>
      {dragPreviewPosition ? (
        <div
          className="pointer-events-none fixed z-50 w-72 max-w-[calc(100vw-2rem)]"
          style={{
            left: dragPreviewPosition.left,
            top: dragPreviewPosition.top,
          }}
        >
          <TaskFloatingPreview title={title} detail={detail} />
        </div>
      ) : null}
    </>
  );
}

const TaskFloatingPreview = ({
  title,
  detail,
  ref,
}: {
  title: string;
  detail: string;
  ref?: React.Ref<HTMLDivElement>;
}) => (
  <div
    ref={ref}
    className="-rotate-1 rounded-[14px] border border-teal-700/50 bg-white p-4 text-stone-900 shadow-[0_16px_40px_rgba(28,25,23,0.22)]"
  >
    <div className="flex items-start gap-2">
      <GripVertical
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-teal-700"
        size={16}
      />
      <div className="min-w-0">
        <h3 className="truncate font-medium">{title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-stone-500">{detail}</p>
      </div>
    </div>
  </div>
);

function ScheduleMenu({
  taskId,
  currentDueDate,
  currentAreaId,
  currentProjectId,
  areaGroups,
  projects,
  today,
  tomorrow,
  open,
  setOpen,
}: {
  taskId: string;
  currentDueDate: string | null;
  currentAreaId: string;
  currentProjectId: string | null;
  areaGroups: NonNullable<DraggableTaskLinkProps["areaGroups"]>;
  projects: NonNullable<DraggableTaskLinkProps["projects"]>;
  today: string;
  tomorrow: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState(currentAreaId);
  const [selectedProjectId, setSelectedProjectId] = useState(
    currentProjectId ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const filteredProjects = selectedAreaId
    ? projects.filter((project) => project.areaId === selectedAreaId)
    : projects;

  async function schedule(dueDate: string | null) {
    if (dueDate === currentDueDate) {
      setOpen(false);
      return;
    }

    setPending(true);
    setError("");
    try {
      await updateTaskSchedule(taskId, { dueDate });
      setOpen(false);
      setPicking(false);
      setAssigning(false);
      startTransition(() => router.refresh());
    } catch {
      setError("Date was not updated.");
    } finally {
      setPending(false);
    }
  }

  async function assign() {
    setPending(true);
    setError("");
    try {
      await updateTaskAssignment(taskId, {
        areaId: selectedAreaId,
        projectId: selectedProjectId || null,
      });
      setOpen(false);
      setPicking(false);
      setAssigning(false);
      startTransition(() => router.refresh());
    } catch {
      setError("Assignment was not updated.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative shrink-0" data-task-control>
      <button
        type="button"
        title="Schedule or assign task"
        onClick={() => setOpen(!open)}
        aria-label="Schedule or assign task"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white text-[13px] font-medium transition ${
          open
            ? "border-teal-700/40 text-teal-800"
            : "border-[#E2E6DF] text-stone-600 hover:border-teal-700/50 hover:text-teal-700"
        }`}
      >
        <CalendarDays size={15} />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-30 w-56 rounded-[20px] border border-white/65 bg-[#FAFBF9]/80 p-2 text-sm shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150">
          <MenuButton disabled={pending} onClick={() => schedule(today)}>
            Today
          </MenuButton>
          <MenuButton disabled={pending} onClick={() => schedule(tomorrow)}>
            Tomorrow
          </MenuButton>
          <MenuButton
            disabled={pending}
            onClick={() => {
              setPicking(true);
              window.setTimeout(() => {
                const input = dateInputRef.current;
                input?.focus();
                if (input && "showPicker" in input) {
                  (
                    input as HTMLInputElement & { showPicker: () => void }
                  ).showPicker();
                }
              }, 0);
            }}
          >
            Pick date
          </MenuButton>
          {picking ? (
            <input
              ref={dateInputRef}
              type="date"
              className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3 text-sm outline-none focus:border-teal-700"
              onChange={(event) => {
                if (event.target.value) {
                  void schedule(event.target.value);
                }
              }}
            />
          ) : null}
          <MenuButton disabled={pending} onClick={() => schedule(null)}>
            Clear date
          </MenuButton>
          <MenuButton
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await updateTaskSchedule(taskId, { someday: true });
                setOpen(false);
                setPicking(false);
                setAssigning(false);
                startTransition(() => router.refresh());
              } catch {
                setError("Task was not updated.");
              } finally {
                setPending(false);
              }
            }}
          >
            Someday
          </MenuButton>
          {areaGroups.length > 0 ? (
            <MenuButton
              disabled={pending}
              onClick={() => setAssigning(!assigning)}
            >
              Assign
            </MenuButton>
          ) : null}
          {assigning ? (
            <div className="space-y-2 border-t border-[#EEF1EC] px-2 pt-2">
              <select
                value={selectedAreaId}
                onChange={(event) => {
                  setSelectedAreaId(event.target.value);
                  setSelectedProjectId("");
                }}
                className="h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3 text-sm outline-none focus:border-teal-700"
              >
                {areaGroups.map((group) => (
                  <optgroup key={group.domainName} label={group.domainName}>
                    {group.areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {projects.length > 0 ? (
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3 text-sm outline-none focus:border-teal-700"
                >
                  <option value="">No project</option>
                  {filteredProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} / {project.areaName}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={assign}
                className="h-10 w-full rounded-full bg-teal-700 px-3 text-center text-sm font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-[#D6DBD3]"
              >
                Save assignment
              </button>
            </div>
          ) : null}
          {error ? (
            <p className="px-3 py-1 text-xs text-amber-800">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block h-10 w-full rounded-[10px] px-3 text-left text-stone-700 transition hover:bg-white/85 disabled:cursor-not-allowed disabled:text-stone-400"
    >
      {children}
    </button>
  );
}

async function updateTaskSchedule(
  taskId: string,
  body: { dueDate?: string | null; someday?: boolean },
) {
  const response = await fetch(`/api/tasks/${taskId}/schedule`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Task date update failed.");
  }
}

async function updateTaskOrder(taskId: string, body: { targetTaskId: string }) {
  const response = await fetch(`/api/tasks/${taskId}/order`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Task order update failed.");
}

async function updateTaskAssignment(
  taskId: string,
  body: { areaId: string; projectId?: string | null },
) {
  const response = await fetch(`/api/tasks/${taskId}/assignment`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Task assignment update failed.");
  }
}

function findTaskCard(taskId: string) {
  return document
    .querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`)
    ?.closest<HTMLElement>("[data-task-card-id]");
}

function moveTaskCardOptimistically(taskId: string, targetTaskId: string) {
  const card = findTaskCard(taskId);
  const targetCard = findTaskCard(targetTaskId);
  if (!card || !targetCard || card === targetCard) return;

  targetCard.parentElement?.insertBefore(card, targetCard);
}

function moveTaskCardToDropZoneOptimistically(taskId: string, dropKey: string) {
  const card = findTaskCard(taskId);
  const dropZone = document.querySelector<HTMLElement>(
    `[data-drop-key="${CSS.escape(dropKey)}"]`,
  );
  const list = dropZone?.querySelector<HTMLElement>("[data-task-drop-list]");
  if (!card || !list) return;

  list.append(card);
}
