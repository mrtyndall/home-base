import { MutationChannel, type ChannelSnapshot } from "@/lib/task-quick-edit-coordinator";

export type TaskQuickEditMutationPhase = "optimistic" | "committed" | "rolled-back" | "undo";

export type OwnedTaskQuickEditMutationEvent<Schedule, Location> =
  | { taskId: string; channel: "schedule"; phase: TaskQuickEditMutationPhase; mutationId: number; value: Schedule }
  | { taskId: string; channel: "location"; phase: TaskQuickEditMutationPhase; mutationId: number; value: Location };

type Bindings<Schedule, Location> = {
  taskId: string;
  writeSchedule(value: Schedule): Promise<Schedule>;
  writeLocation(value: Location): Promise<Location>;
  onMutation?(event: OwnedTaskQuickEditMutationEvent<Schedule, Location>): void;
};

export class TaskQuickEditMutationOwner<Schedule, Location> {
  readonly scheduleChannel: MutationChannel<Schedule>;
  readonly locationChannel: MutationChannel<Location>;
  private bindings: Bindings<Schedule, Location> | null = null;
  private mutationIds = { schedule: 0, location: 0 };
  private activeMutationIds = { schedule: 0, location: 0 };
  private retryPhases: Record<"schedule" | "location", "optimistic" | "undo"> = {
    schedule: "optimistic",
    location: "optimistic",
  };

  constructor(
    schedule: Schedule,
    location: Location,
    sameSchedule: (left: Schedule, right: Schedule) => boolean,
    sameLocation: (left: Location, right: Location) => boolean,
  ) {
    this.scheduleChannel = new MutationChannel(schedule, sameSchedule);
    this.locationChannel = new MutationChannel(location, sameLocation);
  }

  bind(bindings: Bindings<Schedule, Location>) {
    this.bindings = bindings;
  }

  mutateSchedule(next: Schedule) {
    return this.mutate("schedule", next);
  }

  mutateLocation(next: Location) {
    return this.mutate("location", next);
  }

  retrySchedule() {
    return this.retry("schedule");
  }

  retryLocation() {
    return this.retry("location");
  }

  undoSchedule() {
    return this.undo("schedule");
  }

  undoLocation() {
    return this.undo("location");
  }

  private async mutate<Channel extends "schedule" | "location">(
    channel: Channel,
    next: Channel extends "schedule" ? Schedule : Location,
  ) {
    const bindings = this.requireBindings();
    this.retryPhases[channel] = "optimistic";
    const mutationId = this.begin(channel, next);
    if (channel === "schedule") {
      await this.scheduleChannel.mutate(next as Schedule, bindings.writeSchedule);
      this.finish("schedule", mutationId, this.scheduleChannel.snapshot());
    } else {
      await this.locationChannel.mutate(next as Location, bindings.writeLocation);
      this.finish("location", mutationId, this.locationChannel.snapshot());
    }
  }

  private async retry(channel: "schedule" | "location") {
    const bindings = this.requireBindings();
    if (channel === "schedule") {
      const value = this.scheduleChannel.snapshot().retryValue;
      if (value === null) return;
      const mutationId = this.begin("schedule", value, this.retryPhases.schedule);
      await this.scheduleChannel.retry(bindings.writeSchedule);
      this.finish("schedule", mutationId, this.scheduleChannel.snapshot());
    } else {
      const value = this.locationChannel.snapshot().retryValue;
      if (value === null) return;
      const mutationId = this.begin("location", value, this.retryPhases.location);
      await this.locationChannel.retry(bindings.writeLocation);
      this.finish("location", mutationId, this.locationChannel.snapshot());
    }
  }

  private async undo(channel: "schedule" | "location") {
    const bindings = this.requireBindings();
    if (channel === "schedule") {
      const value = this.scheduleChannel.snapshot().undo?.previous;
      if (value === undefined) return;
      this.retryPhases.schedule = "undo";
      const mutationId = this.nextMutationId("schedule");
      bindings.onMutation?.({ taskId: bindings.taskId, channel, phase: "undo", mutationId, value });
      await this.scheduleChannel.undo(bindings.writeSchedule);
      this.finish("schedule", mutationId, this.scheduleChannel.snapshot());
    } else {
      const value = this.locationChannel.snapshot().undo?.previous;
      if (value === undefined) return;
      this.retryPhases.location = "undo";
      const mutationId = this.nextMutationId("location");
      bindings.onMutation?.({ taskId: bindings.taskId, channel, phase: "undo", mutationId, value });
      await this.locationChannel.undo(bindings.writeLocation);
      this.finish("location", mutationId, this.locationChannel.snapshot());
    }
  }

  private begin(channel: "schedule", value: Schedule, phase?: "optimistic" | "undo"): number;
  private begin(channel: "location", value: Location, phase?: "optimistic" | "undo"): number;
  private begin(channel: "schedule" | "location", value: Schedule | Location, phase: "optimistic" | "undo" = "optimistic") {
    const bindings = this.requireBindings();
    const mutationId = this.nextMutationId(channel);
    if (channel === "schedule") {
      bindings.onMutation?.({ taskId: bindings.taskId, channel, phase, mutationId, value: value as Schedule });
    } else {
      bindings.onMutation?.({ taskId: bindings.taskId, channel, phase, mutationId, value: value as Location });
    }
    return mutationId;
  }

  private finish(channel: "schedule", mutationId: number, snapshot: ChannelSnapshot<Schedule>): void;
  private finish(channel: "location", mutationId: number, snapshot: ChannelSnapshot<Location>): void;
  private finish(
    channel: "schedule" | "location",
    mutationId: number,
    snapshot: ChannelSnapshot<Schedule> | ChannelSnapshot<Location>,
  ) {
    if (this.activeMutationIds[channel] !== mutationId) return;
    const bindings = this.requireBindings();
    const phase = snapshot.error ? "rolled-back" : "committed";
    if (!snapshot.error) this.retryPhases[channel] = "optimistic";
    if (channel === "schedule") {
      bindings.onMutation?.({ taskId: bindings.taskId, channel, phase, mutationId, value: snapshot.value as Schedule });
    } else {
      bindings.onMutation?.({ taskId: bindings.taskId, channel, phase, mutationId, value: snapshot.value as Location });
    }
  }

  private nextMutationId(channel: "schedule" | "location") {
    const mutationId = this.mutationIds[channel] + 1;
    this.mutationIds[channel] = mutationId;
    this.activeMutationIds[channel] = mutationId;
    return mutationId;
  }

  private requireBindings() {
    if (!this.bindings) throw new Error("TaskQuickEditMutationOwner must be bound before use");
    return this.bindings;
  }
}
