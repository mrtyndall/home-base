"use client";

import {
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

let activeMouseDragTaskId: string | null = null;

type TaskDropZoneProps = {
  targetDate: string | null;
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
  isEmpty,
  emptyText,
  children,
}: TaskDropZoneProps) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
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
    activeMouseDragTaskId = null;

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
      onDragLeave={() => setIsActive(false)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={handleDrop}
      className={`min-h-20 space-y-2 rounded-lg transition ${
        isActive ? "bg-teal-50 ring-2 ring-teal-300" : ""
      }`}
    >
      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
          {pending ? "Updating date." : emptyText}
        </div>
      ) : (
        children
      )}
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
  const suppressNextClick = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragPending, setDragPending] = useState(false);
  const [, startTransition] = useTransition();

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
    }
  }

  function handleMouseUp() {
    mouseStart.current = null;
    window.setTimeout(() => {
      if (activeMouseDragTaskId === taskId) {
        activeMouseDragTaskId = null;
      }
    }, 0);
  }

  return (
    <div
      data-task-id={taskId}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-home-base-task-id", taskId);
        event.dataTransfer.setData("text/plain", taskId);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-md p-1 transition hover:bg-stone-50 ${
        dragPending ? "opacity-60" : ""
      }`}
    >
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
  );
}

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
        title="Schedule task"
        onClick={() => setOpen(!open)}
        className="grid h-8 w-8 place-items-center rounded-md border border-stone-300 bg-white text-stone-600 transition hover:border-teal-500 hover:text-teal-700"
      >
        <CalendarDays size={15} />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-30 w-48 rounded-lg border border-stone-200 bg-white p-2 text-sm shadow-lg">
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
