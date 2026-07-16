export type HomeTaskInboxStateRow = {
  id: string;
  isNew: boolean;
  path: string;
};

export type InboxMutationChannel = "location" | "schedule";
export type InboxRemovalKind = "schedule" | "someday" | "complete";

type RetryPayload = {
  mutationId: number;
  kind: "assignment" | InboxRemovalKind | "undo";
  value: string | null;
};

type RollbackSnapshot = {
  row: HomeTaskInboxStateRow;
  index: number;
  totalCount: number;
  newCount: number;
};

type InboxMutation = RetryPayload & {
  channel: InboxMutationChannel;
  status: "pending" | "committed" | "undo";
  snapshot: RollbackSnapshot;
};

export type HomeTaskInboxState = {
  rows: HomeTaskInboxStateRow[];
  totalCount: number;
  newCount: number;
  visibleLimit: number;
  mutations: Record<string, InboxMutation>;
  retries: Record<string, RetryPayload>;
};

type HomeTaskInboxInput = {
  rows: HomeTaskInboxStateRow[];
  totalCount: number;
  newCount: number;
};

export function createHomeTaskInboxState(input: HomeTaskInboxInput): HomeTaskInboxState {
  return {
    rows: input.rows.map((row) => ({ ...row })),
    totalCount: input.totalCount,
    newCount: input.newCount,
    visibleLimit: input.rows.length,
    mutations: {},
    retries: {},
  };
}

export function beginInboxAssignment(
  state: HomeTaskInboxState,
  taskId: string,
  path: string,
  mutationId: number,
): HomeTaskInboxState {
  const index = state.rows.findIndex((row) => row.id === taskId);
  if (index < 0) return state;
  const key = mutationKey(taskId, "location");
  const previous = state.mutations[key];
  const snapshot = previous?.status === "pending"
    ? previous.snapshot
    : snapshotAt(state, index);
  const row = state.rows[index];
  const rows = replaceAt(state.rows, index, { ...row, path, isNew: false });
  return {
    ...state,
    rows,
    newCount: state.newCount - (row.isNew ? 1 : 0),
    mutations: {
      ...state.mutations,
      [key]: { mutationId, channel: "location", kind: "assignment", value: path, status: "pending", snapshot },
    },
    retries: withoutKey(state.retries, key),
  };
}

export function beginInboxRemoval(
  state: HomeTaskInboxState,
  taskId: string,
  kind: InboxRemovalKind,
  mutationId: number,
): HomeTaskInboxState {
  const index = state.rows.findIndex((row) => row.id === taskId);
  if (index < 0) return state;
  const channel: InboxMutationChannel = kind === "complete" ? "location" : "schedule";
  const key = mutationKey(taskId, channel);
  const row = state.rows[index];
  return {
    ...state,
    rows: state.rows.filter((candidate) => candidate.id !== taskId),
    totalCount: state.totalCount - 1,
    newCount: state.newCount - (row.isNew ? 1 : 0),
    mutations: {
      ...state.mutations,
      [key]: {
        mutationId,
        channel,
        kind,
        value: null,
        status: "pending",
        snapshot: snapshotAt(state, index),
      },
    },
    retries: withoutKey(state.retries, key),
  };
}

export function commitInboxMutation(
  state: HomeTaskInboxState,
  taskId: string,
  channel: InboxMutationChannel = onlyChannel(state, taskId),
  mutationId?: number,
): HomeTaskInboxState {
  const key = mutationKey(taskId, channel);
  const mutation = state.mutations[key];
  if (!mutation || (mutationId !== undefined && mutation.mutationId !== mutationId)) return state;
  if (mutation.kind === "assignment" || mutation.status === "undo") {
    return { ...state, mutations: withoutKey(state.mutations, key), retries: withoutKey(state.retries, key) };
  }
  return {
    ...state,
    mutations: { ...state.mutations, [key]: { ...mutation, status: "committed" } },
    retries: withoutKey(state.retries, key),
  };
}

export function rollbackInboxMutation(
  state: HomeTaskInboxState,
  taskId: string,
  channel: InboxMutationChannel = onlyChannel(state, taskId),
  mutationId?: number,
): HomeTaskInboxState {
  const key = mutationKey(taskId, channel);
  const mutation = state.mutations[key];
  if (!mutation || (mutationId !== undefined && mutation.mutationId !== mutationId)) return state;
  const otherKey = mutationKey(taskId, channel === "location" ? "schedule" : "location");
  const otherMutation = state.mutations[otherKey];
  if (channel === "location" && otherMutation && otherMutation.kind !== "assignment") {
    return {
      ...state,
      mutations: {
        ...withoutKey(state.mutations, key),
        [otherKey]: {
          ...otherMutation,
          snapshot: {
            ...otherMutation.snapshot,
            row: { ...mutation.snapshot.row },
            totalCount: mutation.snapshot.totalCount,
            newCount: mutation.snapshot.newCount,
          },
        },
      },
      retries: {
        ...state.retries,
        [key]: { mutationId: mutation.mutationId, kind: mutation.kind, value: mutation.value },
      },
    };
  }
  const restored = restoreSnapshot(state, mutation.snapshot);
  return {
    ...restored,
    mutations: withoutKey(state.mutations, key),
    retries: {
      ...state.retries,
      [key]: { mutationId: mutation.mutationId, kind: mutation.kind, value: mutation.value },
    },
  };
}

export function undoInboxRemoval(
  state: HomeTaskInboxState,
  taskId: string,
  channel: InboxMutationChannel = onlyChannel(state, taskId),
  mutationId = 0,
): HomeTaskInboxState {
  const key = mutationKey(taskId, channel);
  const mutation = state.mutations[key];
  if (!mutation || mutation.status !== "committed" || mutation.kind === "assignment") return state;
  const row = { ...mutation.snapshot.row, isNew: false };
  const restoredRows = insertBounded(state.rows, row, mutation.snapshot.index, state.visibleLimit);
  return {
    ...state,
    rows: restoredRows,
    totalCount: state.totalCount + 1,
    mutations: {
      ...state.mutations,
      [key]: {
        mutationId,
        channel,
        kind: "undo",
        value: null,
        status: "undo",
        snapshot: {
          row,
          index: mutation.snapshot.index,
          totalCount: state.totalCount,
          newCount: state.newCount,
        },
      },
    },
    retries: withoutKey(state.retries, key),
  };
}

export function reconcileHomeTaskInbox(
  state: HomeTaskInboxState,
  server: HomeTaskInboxInput,
): HomeTaskInboxState {
  if (Object.values(state.mutations).some((mutation) => mutation.status !== "committed")) return state;
  return {
    ...state,
    rows: server.rows.slice(0, state.visibleLimit).map((row) => ({ ...row })),
    totalCount: server.totalCount,
    newCount: server.newCount,
    retries: {},
  };
}

function snapshotAt(state: HomeTaskInboxState, index: number): RollbackSnapshot {
  return {
    row: { ...state.rows[index] },
    index,
    totalCount: state.totalCount,
    newCount: state.newCount,
  };
}

function restoreSnapshot(state: HomeTaskInboxState, snapshot: RollbackSnapshot): HomeTaskInboxState {
  const withoutTask = state.rows.filter((row) => row.id !== snapshot.row.id);
  return {
    ...state,
    rows: insertBounded(withoutTask, snapshot.row, snapshot.index, state.visibleLimit),
    totalCount: snapshot.totalCount,
    newCount: snapshot.newCount,
  };
}

function insertBounded(rows: HomeTaskInboxStateRow[], row: HomeTaskInboxStateRow, index: number, limit: number) {
  const next = [...rows];
  next.splice(Math.min(index, next.length), 0, { ...row });
  return next.slice(0, limit);
}

function replaceAt(rows: HomeTaskInboxStateRow[], index: number, row: HomeTaskInboxStateRow) {
  return rows.map((candidate, candidateIndex) => candidateIndex === index ? row : candidate);
}

function mutationKey(taskId: string, channel: InboxMutationChannel) {
  return `${taskId}:${channel}`;
}

function onlyChannel(state: HomeTaskInboxState, taskId: string): InboxMutationChannel {
  return state.mutations[mutationKey(taskId, "location")] ? "location" : "schedule";
}

function withoutKey<Value>(record: Record<string, Value>, key: string): Record<string, Value> {
  const next = { ...record };
  delete next[key];
  return next;
}
