import { MutationChannel, type ChannelSnapshot } from "@/lib/task-quick-edit-coordinator";

type Scheduler = {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
};

const scheduler: Scheduler = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class InboxFilingCoordinator<Value> {
  private readonly channel: MutationChannel<Value>;
  private timer: unknown = null;
  private disposed = false;

  constructor(
    initial: Value,
    equal: (left: Value, right: Value) => boolean,
    private readonly refresh: () => void,
    private readonly clock: Scheduler = scheduler,
  ) {
    this.channel = new MutationChannel(initial, equal);
  }

  snapshot = (): ChannelSnapshot<Value> => this.channel.snapshot();
  subscribe = (listener: () => void) => this.channel.subscribe(listener);

  async mutate(next: Value, write: (value: Value) => Promise<Value>) {
    if (this.disposed) return;
    await this.channel.mutate(next, write);
    if (this.disposed) return;
    this.beginUndoWindow();
  }

  async retry(write: (value: Value) => Promise<Value>) {
    if (this.disposed) return;
    await this.channel.retry(write);
    if (this.disposed) return;
    this.beginUndoWindow();
  }

  async undo(write: (value: Value) => Promise<Value>) {
    if (this.disposed) return;
    this.clearTimer();
    await this.channel.undo(write);
    if (this.disposed) return;
    if (this.channel.snapshot().error) return;
    this.channel.clearUndo();
    this.refresh();
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
  }

  private beginUndoWindow() {
    if (this.disposed) return;
    this.clearTimer();
    if (!this.channel.snapshot().undo) return;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.channel.clearUndo();
      this.refresh();
    }, 6000);
  }

  private clearTimer() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}
