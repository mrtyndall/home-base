"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  createTaskQuickEditMutationOwner,
  TaskQuickEdit,
  TaskQuickEditMutationStatusStack,
  type TaskQuickEditMutationEvent,
  type TaskQuickEditMutationOwner,
} from "@/components/task-quick-edit";
import {
  beginInboxAssignment,
  beginInboxRemoval,
  commitInboxMutation,
  createHomeTaskInboxState,
  reconcileHomeTaskInbox,
  rollbackInboxMutation,
  undoInboxRemoval,
  type HomeTaskInboxState,
} from "@/lib/home-task-inbox-state";
import type {
  HomeTaskInboxData,
  HomeTaskInboxRow,
} from "@/lib/home-task-inbox";
export { homeStatusHeadline } from "@/lib/home-task-inbox-status";

type DisplayRow = HomeTaskInboxRow & { areaPath?: string | null };
const HOME_TASK_INBOX_LIMIT = 5;

type InboxClientModel = {
  serverSignature: string;
  pendingServer: { signature: string; data: HomeTaskInboxData } | null;
  inbox: HomeTaskInboxState;
  details: Map<string, DisplayRow>;
  owners: Map<string, TaskQuickEditMutationOwner>;
};

type CompletionOperation = {
  mutationId: number;
  phase: "pending" | "success" | "error";
};

export function HomeTaskInbox({
  data,
  today,
}: {
  data: HomeTaskInboxData;
  today: string;
}) {
  if (data.totalCount === 0) return null;
  return <HomeTaskInboxClient data={data} today={today} />;
}

function HomeTaskInboxClient({
  data,
  today,
}: {
  data: HomeTaskInboxData;
  today: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const incomingSignature = serverSignature(data);
  const [model, setModel] = useState(() => createClientModel(data));
  let renderedModel = model;
  if (
    model.serverSignature !== incomingSignature &&
    model.pendingServer?.signature !== incomingSignature
  ) {
    renderedModel = reconcileClientModel(model, data, incomingSignature);
    setModel(renderedModel);
  }
  const [completionOperations, setCompletionOperations] = useState<
    Record<string, CompletionOperation>
  >({});
  const completionIds = useRef(new Map<string, number>());
  const focusTargetRef = useRef<HTMLElement | null>(null);

  const moveFocusToInbox = useCallback(() => {
    window.requestAnimationFrame(() => focusTargetRef.current?.focus());
  }, []);

  const handleQuickEditMutation = useCallback(
    (event: TaskQuickEditMutationEvent) => {
      setModel((current) => settleClientInbox(
        current,
        reduceQuickEditMutation(current.inbox, event),
      ));
      if (event.channel === "schedule" && event.phase === "optimistic") {
        moveFocusToInbox();
      }
    },
    [moveFocusToInbox],
  );

  async function completeTask(taskId: string) {
    const mutationId = (completionIds.current.get(taskId) ?? 0) + 1;
    completionIds.current.set(taskId, mutationId);
    setCompletionOperations((current) => ({
      ...current,
      [taskId]: { mutationId, phase: "pending" },
    }));
    setModel((current) => ({
      ...current,
      inbox: beginInboxRemoval(
        current.inbox,
        taskId,
        { kind: "complete" },
        mutationId,
      ),
    }));
    moveFocusToInbox();

    try {
      const response = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Completion failed");
      if (completionIds.current.get(taskId) !== mutationId) return;
      setModel((current) => settleClientInbox(
        current,
        commitInboxMutation(
          current.inbox,
          taskId,
          "completion",
          mutationId,
        ),
      ));
      setCompletionOperations((current) => ({
        ...current,
        [taskId]: { mutationId, phase: "success" },
      }));
      startTransition(() => router.refresh());
    } catch {
      if (completionIds.current.get(taskId) !== mutationId) return;
      setModel((current) => settleClientInbox(
        current,
        rollbackInboxMutation(
          current.inbox,
          taskId,
          "completion",
          mutationId,
        ),
      ));
      setCompletionOperations((current) => ({
        ...current,
        [taskId]: { mutationId, phase: "error" },
      }));
    }
  }

  const rows = renderedModel.inbox.rows.slice(0, HOME_TASK_INBOX_LIMIT);

  return (
    <section
      ref={focusTargetRef}
      tabIndex={-1}
      aria-label="Task Inbox status"
      className="min-w-0 overflow-hidden rounded-[14px] border border-[#DDE5DD] bg-white p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#747C72]">
              Task Inbox
            </h2>
            <span className="text-xs tabular-nums text-[#6B7268]">
              {renderedModel.inbox.totalCount}
            </span>
          </div>
          {renderedModel.inbox.newCount > 0 ? (
            <p className="mt-1 text-xs text-teal-800">
              {renderedModel.inbox.newCount} new
            </p>
          ) : null}
        </div>
        <Link
          href="/tasks?section=unscheduled#unscheduled"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-[10px] px-1 text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
        >
          Open all
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-2 min-w-0 divide-y divide-[#EEF1EC]">
        {rows.map((row) => {
          const detail = renderedModel.details.get(row.id);
          if (!detail) return null;
          const owner = renderedModel.owners.get(row.id);
          if (!owner) return null;
          return (
            <article key={row.id} className="min-w-0 py-3 first:pt-2 last:pb-0">
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-start gap-2">
                    <Link
                      href={`/tasks/${row.id}`}
                      className="min-w-0 break-words text-[15px] font-medium leading-snug text-stone-950 transition [overflow-wrap:anywhere] hover:text-teal-700"
                    >
                      {detail.title}
                    </Link>
                    {row.isNew && detail.triagedAt === null ? (
                      <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-teal-800">
                        New
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 min-w-0 break-words text-[13px] leading-snug text-[#6B7268] [overflow-wrap:anywhere]">
                    {row.path}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <TaskQuickEdit
                  taskId={row.id}
                  location={{
                    areaId: detail.areaId,
                    projectId: detail.projectId,
                    label: row.path,
                  }}
                  schedule={{ dueDate: null, someday: false }}
                  today={today}
                  variant="inbox"
                  mutationOwner={owner}
                  onMutation={handleQuickEditMutation}
                />
                <button
                  type="button"
                  aria-label="Complete task"
                  disabled={completionOperations[row.id]?.phase === "pending"}
                  onClick={() => void completeTask(row.id)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-[#DDE5DD] px-3 text-sm font-medium text-stone-700 transition hover:border-teal-700/40 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50 motion-reduce:transition-none"
                >
                  <Check size={16} aria-hidden="true" />
                  <span>Complete</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div aria-live="polite" aria-atomic="true" className="mt-2 min-h-5 text-sm text-[#6B7268]">
        {Object.entries(completionOperations).map(([taskId, operation]) =>
          operation.phase === "error" ? (
            <span
              key={taskId}
              className="flex min-h-11 items-center justify-between gap-3"
              role="alert"
            >
              <span>Couldn’t complete task.</span>
              <button
                type="button"
                className="min-h-11 shrink-0 font-semibold text-teal-800"
                onClick={() => void completeTask(taskId)}
              >
                Retry
              </button>
            </span>
          ) : (
            <span key={taskId} className="block py-1">
              {operation.phase === "pending" ? "Completing task…" : "Task completed."}
            </span>
          ),
        )}
      </div>

      <TaskQuickEditMutationStatusStack
        mutationOwners={Array.from(renderedModel.owners.values())}
      />
    </section>
  );
}

function createInboxState(data: HomeTaskInboxData) {
  return createHomeTaskInboxState(stateInput(data));
}

function createClientModel(data: HomeTaskInboxData): InboxClientModel {
  const details = new Map<string, DisplayRow>();
  const owners = new Map<string, TaskQuickEditMutationOwner>();
  for (const row of data.rows as DisplayRow[]) {
    details.set(row.id, row);
    owners.set(row.id, createOwner(row));
  }
  return {
    serverSignature: serverSignature(data),
    pendingServer: null,
    inbox: createInboxState(data),
    details,
    owners,
  };
}

function reconcileClientModel(
  current: InboxClientModel,
  data: HomeTaskInboxData,
  signature: string,
): InboxClientModel {
  const inbox = reconcileHomeTaskInbox(current.inbox, stateInput(data));
  const deferred = inbox.deferredServer !== null;
  if (deferred) {
    return {
      ...current,
      serverSignature: current.serverSignature,
      pendingServer: { signature, data },
      inbox,
    };
  }
  return applyCanonicalClientModel({ ...current, inbox }, data, signature);
}

function settleClientInbox(
  current: InboxClientModel,
  inbox: HomeTaskInboxState,
): InboxClientModel {
  if (inbox.deferredServer || !current.pendingServer) {
    return { ...current, inbox };
  }
  return applyCanonicalClientModel(
    { ...current, inbox },
    current.pendingServer.data,
    current.pendingServer.signature,
  );
}

function applyCanonicalClientModel(
  current: InboxClientModel,
  data: HomeTaskInboxData,
  signature: string,
): InboxClientModel {
  const details = new Map(current.details);
  const owners = new Map(current.owners);
  for (const row of data.rows as DisplayRow[]) {
    details.set(row.id, row);
    if (!owners.has(row.id)) owners.set(row.id, createOwner(row));
  }
  return {
    ...current,
    serverSignature: signature,
    pendingServer: null,
    details,
    owners,
  };
}

function createOwner(row: DisplayRow) {
  return createTaskQuickEditMutationOwner(
    { dueDate: null, someday: false },
    {
      areaId: row.areaId,
      projectId: row.projectId,
      label: taskPath(row),
    },
  );
}

function serverSignature(data: HomeTaskInboxData) {
  return JSON.stringify({
    totalCount: data.totalCount,
    newCount: data.newCount,
    rows: (data.rows as DisplayRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      triagedAt: row.triagedAt,
      areaId: row.areaId,
      projectId: row.projectId,
      areaPath: row.areaPath,
      areaName: row.area?.name,
      projectName: row.project?.name,
    })),
  });
}

function stateInput(data: HomeTaskInboxData) {
  return {
    rows: (data.rows as DisplayRow[]).map((row) => ({
      id: row.id,
      isNew: row.triagedAt === null,
      path: taskPath(row),
    })),
    totalCount: data.totalCount,
    newCount: data.newCount,
  };
}

function taskPath(row: DisplayRow) {
  const areaPath = row.areaPath ?? row.area?.name ?? null;
  if (row.project) return `${row.project.name} — ${areaPath ?? "No area yet"}`;
  return areaPath ?? "Inbox";
}

function reduceQuickEditMutation(
  state: HomeTaskInboxState,
  event: TaskQuickEditMutationEvent,
) {
  if (event.phase === "optimistic") {
    if (event.channel === "location") {
      return beginInboxAssignment(
        state,
        event.taskId,
        {
          areaId: event.value.areaId,
          projectId: event.value.projectId,
          path: event.value.label,
        },
        event.mutationId,
      );
    }
    return beginInboxRemoval(
      state,
      event.taskId,
      {
        kind: event.value.someday ? "someday" : "schedule",
        dueDate: event.value.dueDate,
        someday: event.value.someday,
      },
      event.mutationId,
    );
  }

  if (event.phase === "undo") {
    if (event.channel === "location") {
      return beginInboxAssignment(
        state,
        event.taskId,
        {
          areaId: event.value.areaId,
          projectId: event.value.projectId,
          path: event.value.label,
        },
        event.mutationId,
      );
    }
    return undoInboxRemoval(state, event.taskId, "schedule", event.mutationId);
  }

  return event.phase === "committed"
    ? commitInboxMutation(state, event.taskId, event.channel, event.mutationId)
    : rollbackInboxMutation(state, event.taskId, event.channel, event.mutationId);
}
