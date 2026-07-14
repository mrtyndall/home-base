import { z } from "zod";

export const captureInputSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
  rawText: z.string().trim().min(1).max(10_000),
  source: z
    .enum(["in_app_text", "in_app_voice", "ios_shortcut", "android_shortcut", "api"])
    .default("in_app_text"),
  captureIntent: z
    .enum(["auto", "task", "note", "idea", "reference"])
    .default("auto"),
  captureDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  captureAreaId: z.string().trim().min(1).optional(),
  captureProjectId: z.string().trim().min(1).optional(),
  deviceContext: z.record(z.string(), z.unknown()).optional(),
});

export type CaptureInput = z.infer<typeof captureInputSchema>;

const createTaskAction = z.object({
  type: z.literal("create_task"),
  area_id: z.string().optional(),
  area_match: z.string().optional(),
  project_id: z.string().optional(),
  project_match: z.string().optional(),
  parent_task_match: z.string().optional(),
  title: z.string().min(1),
  notes: z.string().optional(),
  due_date: z.string().optional(),
  due_time: z.string().optional(),
  priority: z.string().optional(),
  reminder_offsets: z.array(z.string()).optional(),
  someday: z.boolean().optional(),
  starred: z.boolean().optional(),
});

const completeTaskAction = z.object({
  type: z.literal("complete_task"),
  task_match: z.string().min(1),
});

const starTaskAction = z.object({
  type: z.literal("star_task"),
  task_match: z.string().min(1),
  starred: z.boolean().optional(),
});

const createAreaAction = z.object({
  type: z.literal("create_area"),
  name: z.string().min(1),
});

const updateAreaStateAction = z.object({
  type: z.literal("update_area_state"),
  area_match: z.string().min(1),
  current_state: z.string().optional(),
  next_step: z.string().optional(),
  log_entry: z.string().optional(),
  status: z.enum(["active", "parked", "retired"]).optional(),
});

const createProjectAction = z.object({
  type: z.literal("create_project"),
  name: z.string().min(1),
  area_match: z.string().optional(),
  target_date: z.string().optional(),
  status: z.enum(["someday", "active"]).optional(),
});

const updateProjectStateAction = z.object({
  type: z.literal("update_project_state"),
  project_match: z.string().min(1),
  current_state: z.string().optional(),
  next_step: z.string().optional(),
  log_entry: z.string().optional(),
  status: z.enum(["someday", "active", "parked", "completed", "killed"]).optional(),
});

const createCalendarEventAction = z.object({
  type: z.literal("create_calendar_event"),
  title: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  location: z.string().optional(),
});

const createIdeaAction = z.object({
  type: z.literal("create_idea"),
  title: z.string().min(1),
  body: z.string().optional(),
  area_id: z.string().optional(),
  area_match: z.string().optional(),
  project_id: z.string().optional(),
  project_match: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const appendToIdeaAction = z.object({
  type: z.literal("append_to_idea"),
  idea_match: z.string().min(1),
  body: z.string().min(1),
});

const convertIdeaAction = z.object({
  type: z.literal("convert_idea"),
  idea_match: z.string().min(1),
  to: z.enum(["task", "project"]),
  title: z.string().optional(),
  area_match: z.string().optional(),
  project_match: z.string().optional(),
});

const createReferenceAction = z.object({
  type: z.literal("create_reference"),
  body: z.string().min(1),
  url: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  area_id: z.string().optional(),
  area_match: z.string().optional(),
  project_id: z.string().optional(),
  project_match: z.string().optional(),
  related_match: z.string().optional(),
});

const createPersonAction = z.object({
  type: z.literal("create_person"),
  name: z.string().min(1),
  relationship_type: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  area_match: z.string().optional(),
});

const createPersonFactAction = z.object({
  type: z.literal("create_person_fact"),
  person_match: z.string().min(1),
  fact_type: z.string().optional(),
  fact_value: z.string().min(1),
  date_relevant: z.string().optional(),
  recurring: z.boolean().optional(),
});

const logInteractionAction = z.object({
  type: z.literal("log_interaction"),
  person_match: z.string().min(1),
  interaction_type: z.string().optional(),
  notes: z.string().optional(),
  occurred_at: z.string().optional(),
});

const createRoutineAction = z.object({
  type: z.literal("create_routine"),
  name: z.string().min(1),
  description: z.string().optional(),
  area_match: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "custom"]).optional(),
  days: z.array(z.string()).optional(),
  time_window: z.enum(["morning", "afternoon", "evening", "anytime"]).optional(),
  times_per_week: z.number().optional(),
  grace_days: z.number().optional(),
  temporary: z.boolean().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const completeRoutineAction = z.object({
  type: z.literal("complete_routine"),
  routine_match: z.string().min(1),
  value: z.string().optional(),
});

// review_at or review_condition_text must be present; enforced at
// execution (discriminated unions require plain object schemas).
const scheduleReviewAction = z.object({
  type: z.literal("schedule_review"),
  review_at: z.string().optional(),
  review_condition_text: z.string().optional(),
});

const boostResurfaceAction = z.object({
  type: z.literal("boost_resurface"),
  item_match: z.string().min(1),
});

const journalAction = z.object({
  type: z.literal("journal"),
  body_md: z.string().min(1),
  entry_date: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const checkInAction = z.object({
  type: z.literal("check_in"),
  parent_type: z.enum(["area", "project"]).optional(),
  area_match: z.string().optional(),
  project_match: z.string().optional(),
  body_md: z.string().min(1),
});

const createEntityNoteAction = z.object({
  type: z.literal("create_entity_note"),
  parent_type: z.enum(["area", "project"]).optional(),
  area_id: z.string().optional(),
  area_match: z.string().optional(),
  project_id: z.string().optional(),
  project_match: z.string().optional(),
  body_md: z.string().min(1),
});

const createEntityDocAction = z.object({
  type: z.literal("create_entity_doc"),
  parent_type: z.enum(["area", "project"]).optional(),
  area_id: z.string().optional(),
  area_match: z.string().optional(),
  project_id: z.string().optional(),
  project_match: z.string().optional(),
  title: z.string().min(1),
  body_md: z.string().min(1),
});

export const executableActionSchema = z.discriminatedUnion("type", [
  createTaskAction,
  completeTaskAction,
  starTaskAction,
  createAreaAction,
  updateAreaStateAction,
  createProjectAction,
  updateProjectStateAction,
  createCalendarEventAction,
  createIdeaAction,
  appendToIdeaAction,
  convertIdeaAction,
  createReferenceAction,
  journalAction,
  boostResurfaceAction,
  scheduleReviewAction,
  createRoutineAction,
  completeRoutineAction,
  createPersonAction,
  createPersonFactAction,
  logInteractionAction,
  checkInAction,
  createEntityNoteAction,
  createEntityDocAction,
]);

export const ambiguousActionSchema = z.object({
  needs_disambiguation: z.literal(true),
  candidates: z.array(z.unknown()).default([]),
  reason: z.string().optional(),
});

export const parserErrorActionSchema = z.object({
  error: z.string().min(1),
});

export const parserActionSchema = z.union([
  executableActionSchema,
  ambiguousActionSchema,
  parserErrorActionSchema,
]);

export const parserActionsSchema = z.array(parserActionSchema);

export type ExecutableAction = z.infer<typeof executableActionSchema>;
export type ParserAction = z.infer<typeof parserActionSchema>;

export type CreatedItemRef = {
  type:
    | "task"
    | "pending_capture"
    | "area"
    | "project"
    | "project_activity"
    | "calendar_event"
    | "idea"
    | "idea_note"
    | "reference"
    | "entity_note"
    | "entity_doc"
    | "check_in"
    | "journal_entry"
    | "scheduled_review"
    | "routine"
    | "routine_completion"
    | "person"
    | "person_fact"
    | "person_interaction"
    | "notification";
  id: string;
  label: string;
};

export type CaptureConfirmation = {
  captureId: string;
  status: "parsed" | "ambiguous" | "failed";
  message: string;
  createdItems: CreatedItemRef[];
};
