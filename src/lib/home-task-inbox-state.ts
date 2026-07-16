export type HomeTaskInboxStateRow = {
  id: string;
  isNew: boolean;
  path: string;
};

export type InboxMutationChannel = "location" | "schedule";

export type InboxAssignmentPayload = {
  areaId: string | null;
  projectId: string | null;
  path: string;
};

export type InboxMutationPayload =
  | ({ kind: "assignment" } & InboxAssignmentPayload)
  | { kind: "schedule" | "someday"; dueDate: string | null; someday: boolean }
  | { kind: "complete" }
  | { kind: "undo" };

type RetryPayload = {
  mutationId: number;
  payload: InboxMutationPayload;
};

type InboxMutation = RetryPayload & {
  channel: InboxMutationChannel;
  status: "pending" | "committed" | "undo";
  row: HomeTaskInboxStateRow;
  index: number;
  totalDelta: number;
  newDelta: number;
  undoOf?: InboxMutation;
};

export type HomeTaskInboxState = {
  rows: HomeTaskInboxStateRow[];
  totalCount: number;
  newCount: number;
  visibleLimit: number;
  rowOrder: string[];
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
    rows: cloneRows(input.rows),
    totalCount: input.totalCount,
    newCount: input.newCount,
    visibleLimit: input.rows.length,
    rowOrder: input.rows.map((row) => row.id),
    mutations: {},
    retries: {},
  };
}

export function beginInboxAssignment(
  state: HomeTaskInboxState,
  taskId: string,
  assignment: InboxAssignmentPayload,
  mutationId: number,
): HomeTaskInboxState {
  const index = state.rows.findIndex((row) => row.id === taskId);
  if (index < 0) return state;
  const key = mutationKey(taskId, "location");
  const previous = state.mutations[key];
  const row = state.rows[index];
  const firstAttempt = previous?.status !== "pending";
  const newDelta = firstAttempt && row.isNew ? -1 : previous?.newDelta ?? 0;
  return {
    ...state,
    rows: replaceAt(state.rows, index, { ...row, path: assignment.path, isNew: false }),
    newCount: state.newCount + (firstAttempt ? newDelta : 0),
    mutations: {
      ...state.mutations,
      [key]: {
        mutationId,
        channel: "location",
        payload: { kind: "assignment", ...assignment },
        status: "pending",
        row: previous?.row ?? { ...row },
        index: previous?.index ?? index,
        totalDelta: 0,
        newDelta,
      },
    },
    retries: withoutKey(state.retries, key),
  };
}

export function beginInboxRemoval(
  state: HomeTaskInboxState,
  taskId: string,
  payload: Exclude<InboxMutationPayload, { kind: "assignment" | "undo" }>,
  mutationId: number,
): HomeTaskInboxState {
  const index = state.rows.findIndex((row) => row.id === taskId);
  if (index < 0) return state;
  const channel: InboxMutationChannel = payload.kind === "complete" ? "location" : "schedule";
  const key = mutationKey(taskId, channel);
  const row = state.rows[index];
  const newDelta = row.isNew ? -1 : 0;
  return {
    ...state,
    rows: state.rows.filter((candidate) => candidate.id !== taskId),
    totalCount: state.totalCount - 1,
    newCount: state.newCount + newDelta,
    mutations: {
      ...state.mutations,
      [key]: {
        mutationId,
        channel,
        payload,
        status: "pending",
        row: { ...row },
        index,
        totalDelta: -1,
        newDelta,
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
  if (!isCurrent(mutation, mutationId)) return state;
  if (mutation.payload.kind === "assignment" || mutation.status === "undo") {
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
  if (!isCurrent(mutation, mutationId)) return state;
  const retry = { mutationId: mutation.mutationId, payload: mutation.payload };

  if (mutation.status === "undo") {
    return {
      ...state,
      rows: state.rows.filter((row) => row.id !== taskId),
      totalCount: state.totalCount - mutation.totalDelta,
      newCount: state.newCount - mutation.newDelta,
      mutations: mutation.undoOf
        ? { ...withoutKey(state.mutations, key), [key]: mutation.undoOf }
        : withoutKey(state.mutations, key),
      retries: { ...state.retries, [key]: retry },
    };
  }

  const otherKey = mutationKey(taskId, channel === "location" ? "schedule" : "location");
  const other = state.mutations[otherKey];
  if (channel === "location" && other && other.payload.kind !== "assignment") {
    const adjustedNewDelta = mutation.row.isNew ? -1 : 0;
    return {
      ...state,
      newCount: state.newCount - mutation.newDelta + adjustedNewDelta - other.newDelta,
      mutations: {
        ...withoutKey(state.mutations, key),
        [otherKey]: { ...other, row: { ...mutation.row }, newDelta: adjustedNewDelta },
      },
      retries: { ...state.retries, [key]: retry },
    };
  }

  return {
    ...state,
    rows: insertInOrder(state, mutation.row),
    totalCount: state.totalCount - mutation.totalDelta,
    newCount: state.newCount - mutation.newDelta,
    mutations: withoutKey(state.mutations, key),
    retries: { ...state.retries, [key]: retry },
  };
}

export function undoInboxRemoval(
  state: HomeTaskInboxState,
  taskId: string,
  channel: InboxMutationChannel = onlyChannel(state, taskId),
  mutationId = 0,
): HomeTaskInboxState {
  const key = mutationKey(taskId, channel);
  const committed = state.mutations[key];
  if (!committed || committed.status !== "committed" || committed.payload.kind === "assignment") return state;
  const row = { ...committed.row, isNew: false };
  return {
    ...state,
    rows: insertInOrder(state, row),
    totalCount: state.totalCount + 1,
    mutations: {
      ...state.mutations,
      [key]: {
        mutationId,
        channel,
        payload: { kind: "undo" },
        status: "undo",
        row,
        index: committed.index,
        totalDelta: 1,
        newDelta: 0,
        undoOf: committed,
      },
    },
    retries: withoutKey(state.retries, key),
  };
}

export function reconcileHomeTaskInbox(state: HomeTaskInboxState, server: HomeTaskInboxInput): HomeTaskInboxState {
  if (Object.values(state.mutations).some((mutation) => mutation.status !== "committed")) return state;
  return {
    ...state,
    rows: cloneRows(server.rows.slice(0, state.visibleLimit)),
    totalCount: server.totalCount,
    newCount: server.newCount,
    rowOrder: mergeOrder(server.rows.map((row) => row.id), state.rowOrder),
    retries: {},
  };
}

function insertInOrder(state: HomeTaskInboxState, row: HomeTaskInboxStateRow) {
  const rank = new Map(state.rowOrder.map((id, index) => [id, index]));
  return [...state.rows.filter((candidate) => candidate.id !== row.id), { ...row }]
    .sort((left, right) => (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER))
    .slice(0, state.visibleLimit);
}

function mergeOrder(current: string[], previous: string[]) {
  return [...current, ...previous.filter((id) => !current.includes(id))];
}

function cloneRows(rows: HomeTaskInboxStateRow[]) {
  return rows.map((row) => ({ ...row }));
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

function isCurrent(mutation: InboxMutation | undefined, mutationId: number | undefined): mutation is InboxMutation {
  return Boolean(mutation && (mutationId === undefined || mutation.mutationId === mutationId));
}

function withoutKey<Value>(record: Record<string, Value>, key: string): Record<string, Value> {
  const next = { ...record };
  delete next[key];
  return next;
}
