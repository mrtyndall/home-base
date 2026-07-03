"use client";

import {
  type DragEvent,
  type MouseEvent,
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

let activeMouseDragTaskId: string | null = null;
const dragStartEvent = "home-base-task-drag-start";
const dragEndEvent = "home-base-task-drag-end";

type TaskDragPreview = {
  title: string;
  detail: string;
};

type TaskDragPreviewPosition = {
  left: number;
  top: number;
};

function announceTaskDragStart(preview: TaskDragPreview) {
  window.dispatchEvent(new CustomEvent(dragStartEvent, { detail: preview }));
}

function announceTaskDragEnd() {
  activeMouseDragTaskId = null;
  window.dispatchEvent(new Event(dragEndEvent));
}

type TaskDropZoneProps = {
  targetDate: string | null;
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
  label = "section",
  isEmpty,
  emptyText,
  children,
}: TaskDropZoneProps) {
  const router = useRouter();
  const [draggingTask, setDraggingTask] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [preview, setPreview] = useState<TaskDragPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const handleDragStart = (event: Event) => {
      setDraggingTask(true);
      setPreview(
        event instanceof CustomEvent ? (event.detail as TaskDragPreview) : null,
      );
    };
    const handleDragEnd = () => {
      setDraggingTask(false);
      setIsActive(false);
      setPreview(null);
    };
    window.addEventListener(dragStartEvent, handleDragStart);
    window.addEventListener(dragEndEvent, handleDragEnd);
    return () => {
      window.removeEventListener(dragStartEvent, handleDragStart);
      window.removeEventListener(dragEndEvent, handleDragEnd);
    };
  }, []);

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    announceTaskDragEnd();
    setIsActive(false);

    const taskId =
      event.dataTransfer.getData("application/x-home-base-task-id") ||
      event.dataTransfer.getData("text/plain");
    if (!taskId) return;

    setPending(true);
    try {
      await updateTaskSchedule(taskId, { dueDate: targetDate });
      startTransition(() => router.refresh());
    } finally {
      setPending(false);
    }
  }

  async function handleMouseUp() {
    const taskId = activeMouseDragTaskId;
    if (!taskId) return;
    announceTaskDragEnd();

    setPending(true);
    try {
      await updateTaskSchedule(taskId, { dueDate: targetDate });
      startTransition(() => router.refresh());
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-drop-date={targetDate ?? "none"}
      onMouseUp={handleMouseUp}
      onDragEnter={() => setIsActive(true)}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsActive(false);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsActive(true);
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={handleDrop}
      className={`relative min-h-20 space-y-2 rounded-lg border border-transparent p-1 transition ${
        draggingTask
          ? "border-dashed border-teal-300 bg-teal-50/60 ring-1 ring-teal-200"
          : ""
      } ${isActive ? "border-teal-500 bg-teal-50 ring-2 ring-teal-300" : ""}`}
    >
      {draggingTask ? (
        <div
          className={`mb-2 rounded-md px-3 py-2 text-sm font-medium transition ${
            isActive ? "bg-teal-700 text-white" : "bg-white/80 text-teal-800"
          }`}
        >
          Move here: {label}
        </div>
      ) : null}
      {draggingTask && isActive && preview ? (
        <div className="mb-2 rounded-lg border border-teal-400 bg-white p-4 shadow-md ring-2 ring-teal-200">
          <h3 className="font-medium text-stone-950">{preview.title}</h3>
          <p className="mt-1 text-sm text-stone-500">{preview.detail}</p>
        </div>
      ) : null}
      <div className={`${draggingTask ? "space-y-2" : ""}`}>
        {isEmpty ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
            {pending ? "Updating date." : emptyText}
          </div>
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
  currentAreaId = "area_inbox",
  currentProjectId = null,
  areaGroups = [],
  projects = [],
  today,
  tomorrow,
}: DraggableTaskLinkProps) {
  const router = useRouter();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const mouseStart = useRef<{ x: number; y: number } | null>(null);
  const pointerDragging = useRef(false);
  const dragAnnounced = useRef(false);
  const nativeDragImageRef = useRef<HTMLDivElement | null>(null);
  const suppressNextClick = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragPending, setDragPending] = useState(false);
  const [dragPreviewPosition, setDragPreviewPosition] =
    useState<TaskDragPreviewPosition | null>(null);
  const [, startTransition] = useTransition();

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

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button,input")) return;
    clearLongPress();
    pointerStart.current = { x: event.clientX, y: event.clientY };
    pointerDragging.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    longPressTimer.current = setTimeout(() => {
      suppressNextClick.current = true;
      setMenuOpen(true);
    }, 450);
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
      clearLongPress();
      moveDragPreview(event.clientX, event.clientY);
      markDragStarted(event.clientX, event.clientY);
    }
  }

  async function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const wasDragging = pointerDragging.current;
    pointerStart.current = null;
    pointerDragging.current = false;
    clearLongPress();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!wasDragging) return;

    const dropTarget = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-drop-date]");
    const targetDateValue = dropTarget?.dataset.dropDate;
    const targetDate = targetDateValue === "none" ? null : targetDateValue;
    markDragEnded();
    if (targetDate === undefined) return;

    event.preventDefault();
    setDragPending(true);
    try {
      await updateTaskSchedule(taskId, { dueDate: targetDate });
      startTransition(() => router.refresh());
    } finally {
      setDragPending(false);
    }
  }

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button,input")) return;
    mouseStart.current = { x: event.clientX, y: event.clientY };
    activeMouseDragTaskId = null;
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!mouseStart.current) return;
    const distance = Math.hypot(
      event.clientX - mouseStart.current.x,
      event.clientY - mouseStart.current.y,
    );
    if (distance > 8) {
      activeMouseDragTaskId = taskId;
      suppressNextClick.current = true;
      clearLongPress();
      moveDragPreview(event.clientX, event.clientY);
      markDragStarted(event.clientX, event.clientY);
    }
  }

  function handleMouseUp() {
    mouseStart.current = null;
    window.setTimeout(() => {
      if (activeMouseDragTaskId === taskId) {
        markDragEnded();
      }
    }, 0);
  }

  return (
    <>
      <div
        data-task-id={taskId}
        draggable
        onDragStart={(event) => {
          markDragStarted(event.clientX, event.clientY);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-home-base-task-id", taskId);
          event.dataTransfer.setData("text/plain", taskId);
          if (nativeDragImageRef.current) {
            event.dataTransfer.setDragImage(nativeDragImageRef.current, 16, 16);
          }
        }}
        onDrag={(event) => moveDragPreview(event.clientX, event.clientY)}
        onDragEnd={markDragEnded}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`-m-1 flex min-w-0 flex-1 cursor-grab items-start gap-2 rounded-md p-1 transition active:cursor-grabbing hover:bg-stone-50 ${
          dragPending ? "opacity-60" : ""
        } ${dragPreviewPosition ? "opacity-50" : ""}`}
      >
        <GripVertical
          aria-hidden="true"
          className="mt-0.5 hidden shrink-0 text-stone-300 sm:block"
          size={16}
        />
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
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-sm text-stone-500">{detail}</p>
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
      <div className="pointer-events-none fixed -left-[9999px] top-0 w-72">
        <TaskFloatingPreview
          ref={nativeDragImageRef}
          title={title}
          detail={detail}
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
    className="rounded-xl border border-teal-400 bg-white p-4 text-stone-900 shadow-xl ring-2 ring-teal-100"
  >
    <div className="flex items-start gap-2">
      <GripVertical
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-teal-500"
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
  const [selectedAreaId, setSelectedAreaId] = useState(currentAreaId);
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId ?? "");
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
    <div className="relative shrink-0">
      <button
        type="button"
        title="Move, schedule, or assign task"
        onClick={() => setOpen(!open)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2 text-sm font-medium text-stone-600 transition hover:border-teal-500 hover:text-teal-700"
      >
        <CalendarDays size={15} />
        Move
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-30 w-52 rounded-lg border border-stone-200 bg-white p-2 text-sm shadow-lg">
          <MenuButton disabled={pending} onClick={() => schedule(today)}>
            Today
          </MenuButton>
          <MenuButton disabled={pending} onClick={() => schedule(tomorrow)}>
            Tomorrow
          </MenuButton>
          <MenuButton disabled={pending} onClick={() => setPicking(!picking)}>
            Pick date
          </MenuButton>
          {picking ? (
            <input
              type="date"
              className="mt-1 h-9 w-full rounded-md border border-stone-300 px-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
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
            <MenuButton disabled={pending} onClick={() => setAssigning(!assigning)}>
              Assign
            </MenuButton>
          ) : null}
          {assigning ? (
            <div className="space-y-2 border-t border-stone-100 px-2 pt-2">
              <select
                value={selectedAreaId}
                onChange={(event) => {
                  setSelectedAreaId(event.target.value);
                  setSelectedProjectId("");
                }}
                className="h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
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
                  className="h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
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
                className="h-9 w-full rounded-md bg-teal-700 px-2 text-left text-sm font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                Save assignment
              </button>
            </div>
          ) : null}
          {error ? <p className="px-2 py-1 text-xs text-stone-600">{error}</p> : null}
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
      className="block h-9 w-full rounded-md px-2 text-left text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
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
