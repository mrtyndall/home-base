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
    await this.channel.mutate(next, write);
    this.beginUndoWindow();
  }

  async retry(write: (value: Value) => Promise<Value>) {
    await this.channel.retry(write);
    this.beginUndoWindow();
  }

  async undo(write: (value: Value) => Promise<Value>) {
    this.clearTimer();
    await this.channel.undo(write);
    if (this.channel.snapshot().error) return;
    this.channel.clearUndo();
    this.refresh();
  }

  dispose() {
    this.clearTimer();
  }

  private beginUndoWindow() {
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
