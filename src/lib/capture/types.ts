import { z } from "zod";

export const captureInputSchema = z.object({
  rawText: z.string().trim().min(1).max(10_000),
  source: z
    .enum(["in_app_text", "in_app_voice", "ios_shortcut", "android_shortcut", "api"])
    .default("in_app_text"),
  deviceContext: z.record(z.string(), z.unknown()).optional(),
});

export type CaptureInput = z.infer<typeof captureInputSchema>;

const createTaskAction = z.object({
  type: z.literal("create_task"),
  area_match: z.string().optional(),
  project_match: z.string().optional(),
  parent_task_match: z.string().optional(),
  title: z.string().min(1),
  notes: z.string().optional(),
  due_date: z.string().optional(),
  due_time: z.string().optional(),
  priority: z.string().optional(),
  reminder_offsets: z.array(z.string()).optional(),
  someday: z.boolean().optional(),
});

const completeTaskAction = z.object({
  type: z.literal("complete_task"),
  task_match: z.string().min(1),
});

const createAreaAction = z.object({
  type: z.literal("create_area"),
  name: z.string().min(1),
  domain_match: z.string().min(1),
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
  area_match: z.string().optional(),
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
  area_match: z.string().optional(),
  project_match: z.string().optional(),
  related_match: z.string().optional(),
});

const createEntityNoteAction = z.object({
  type: z.literal("create_entity_note"),
  parent_type: z.enum(["area", "project"]),
  area_match: z.string().optional(),
  project_match: z.string().optional(),
  body_md: z.string().min(1),
});

const createEntityDocAction = z.object({
  type: z.literal("create_entity_doc"),
  parent_type: z.enum(["area", "project"]),
  area_match: z.string().optional(),
  project_match: z.string().optional(),
  title: z.string().min(1),
  body_md: z.string().min(1),
});

export const executableActionSchema = z.discriminatedUnion("type", [
  createTaskAction,
  completeTaskAction,
  createAreaAction,
  updateAreaStateAction,
  createProjectAction,
  updateProjectStateAction,
  createCalendarEventAction,
  createIdeaAction,
  appendToIdeaAction,
  convertIdeaAction,
  createReferenceAction,
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
    | "area"
    | "project"
    | "project_activity"
    | "calendar_event"
    | "idea"
    | "idea_note"
    | "reference"
    | "entity_note"
    | "entity_doc"
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
