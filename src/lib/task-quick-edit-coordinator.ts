export type ChannelSnapshot<Value> = {
  value: Value;
  pending: boolean;
  error: string | null;
  retryValue: Value | null;
  undo: { previous: Value; next: Value } | null;
};

export class MutationChannel<Value> {
  private committed: Value;
  private state: ChannelSnapshot<Value>;
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private pendingCount = 0;
  private listeners = new Set<() => void>();

  constructor(initial: Value, private readonly equal: (left: Value, right: Value) => boolean) {
    this.committed = initial;
    this.state = { value: initial, pending: false, error: null, retryValue: null, undo: null };
  }

  snapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  reconcile(value: Value) {
    if (this.pendingCount > 0) return;
    this.committed = value;
    this.update({ value, pending: false, error: null, retryValue: null, undo: null });
  }

  mutate(next: Value, write: (value: Value) => Promise<Value>): Promise<void> {
    if (this.pendingCount === 0 && this.equal(next, this.state.value)) return Promise.resolve();
    const generation = ++this.generation;
    this.pendingCount += 1;
    this.update({ value: next, pending: true, error: null, retryValue: null, undo: null });

    const operation = this.queue.then(async () => {
      const previous = this.committed;
      try {
        const authoritative = await write(next);
        this.committed = authoritative;
        this.pendingCount -= 1;
        if (generation === this.generation) {
          this.update({
            value: authoritative,
            pending: this.pendingCount > 0,
            error: null,
            retryValue: null,
            undo: { previous, next: authoritative },
          });
        }
      } catch {
        this.pendingCount -= 1;
        if (generation === this.generation) {
          this.update({
            value: this.committed,
            pending: this.pendingCount > 0,
            error: "Couldn’t update task",
            retryValue: next,
            undo: null,
          });
        }
      }
    });
    this.queue = operation;
    return operation;
  }

  retry(write: (value: Value) => Promise<Value>) {
    const value = this.state.retryValue;
    return value === null ? Promise.resolve() : this.mutate(value, write);
  }

  undo(write: (value: Value) => Promise<Value>) {
    const undo = this.state.undo;
    return undo === null ? Promise.resolve() : this.mutate(undo.previous, write);
  }

  clearUndo() {
    if (this.state.undo) this.update({ ...this.state, undo: null });
  }

  private update(next: ChannelSnapshot<Value>) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}

export class LatestRequestCoordinator {
  private controller: AbortController | null = null;
  private generation = 0;

  begin() {
    this.controller?.abort();
    const controller = new AbortController();
    const generation = ++this.generation;
    this.controller = controller;
    return {
      signal: controller.signal,
      isCurrent: () => this.generation === generation && !controller.signal.aborted,
    };
  }

  cancel() {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }
}

export async function runLatestRequest<Value>(
  coordinator: LatestRequestCoordinator,
  request: (signal: AbortSignal) => Promise<Value>,
): Promise<Value | undefined> {
  const operation = coordinator.begin();
  try {
    const value = await request(operation.signal);
    return operation.isCurrent() ? value : undefined;
  } catch (error) {
    if (!operation.isCurrent()) return undefined;
    throw error;
  }
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;
export const recentDestinationStorageKey = "home-base:task-quick-edit:recent-destinations";

export function readRecentDestinationIds(storage: StorageLike | null | undefined) {
  if (!storage) return [] as string[];
  try {
    const value = JSON.parse(storage.getItem(recentDestinationStorageKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function writeRecentDestinationId(storage: StorageLike | null | undefined, id: string) {
  try {
    const ids = [id, ...readRecentDestinationIds(storage).filter((item) => item !== id)].slice(0, 5);
    storage?.setItem(recentDestinationStorageKey, JSON.stringify(ids));
    return ids;
  } catch {
    return [];
  }
}
