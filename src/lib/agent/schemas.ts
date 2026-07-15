import { z } from "zod";

const uuidSchema = z.string().uuid();
const shortTextSchema = z.string().trim().min(1).max(500);
const entityNameSchema = z.string().trim().min(1).max(200);
const entityIdSchema = z.string().trim().min(1).max(200);
export const agentModelSchema = z.string().trim().min(1).max(200);

type WorkerFeatureFlagEnvironment = Readonly<Record<string, string | undefined>>;

export function isAgentWorkerEnabled(
  role: "sorter" | "assistant",
  environment: WorkerFeatureFlagEnvironment = process.env,
) {
  return role === "sorter"
    ? environment.HOME_BASE_CODEX_SORTER_ENABLED === "true"
    : environment.HOME_BASE_CODEX_ASSISTANT_ENABLED === "true";
}

export const sorterTargetTypeSchema = z.enum([
  "task",
  "idea",
  "note",
  "reference",
]);

export const sorterResultSchema = z
  .object({
    disposition: z.enum(["proposal", "unresolved"]),
    targetType: sorterTargetTypeSchema.nullable(),
    areaId: entityIdSchema.nullable(),
    projectId: entityIdSchema.nullable(),
    confidence: z.number().min(0).max(1),
    reason: shortTextSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.disposition === "unresolved") {
      if (value.targetType !== null || value.areaId !== null || value.projectId !== null) {
        context.addIssue({
          code: "custom",
          message: "Unresolved results cannot select a type or destination.",
        });
      }
    } else if (value.targetType === null) {
      context.addIssue({
        code: "custom",
        message: "Proposals must select a target type.",
      });
    }
  });

const destinationSchema = z
  .object({
    id: entityIdSchema,
    name: entityNameSchema,
    path: z.string().trim().min(1).max(500),
  })
  .strict();

const projectDestinationSchema = destinationSchema.extend({
  areaId: entityIdSchema.nullable(),
}).strict();

const routingExampleSchema = z
  .object({
    text: z.string().trim().min(1).max(2_000),
    targetType: sorterTargetTypeSchema,
    areaId: entityIdSchema.nullable(),
    projectId: entityIdSchema.nullable(),
  })
  .strict();

export const sorterJobInputSchema = z
  .object({
    captureId: uuidSchema,
    text: z.string().trim().min(1).max(10_000),
    now: z.string().datetime(),
    timezone: z.string().trim().min(1).max(100),
    areas: z.array(destinationSchema).max(200),
    projects: z.array(projectDestinationSchema).max(200),
    examples: z.array(routingExampleSchema).max(8),
  })
  .strict();

const searchToolCallSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.literal("search"),
    arguments: z
      .object({
        query: z.string().trim().min(1).max(500),
        limit: z.number().int().min(1).max(25).default(10),
      })
      .strict(),
  })
  .strict();

const listToolCallSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.enum([
      "list_areas",
      "list_projects",
      "list_tasks",
      "list_routines",
      "list_people",
      "list_references",
    ]),
    arguments: z
      .object({
        status: z.string().trim().min(1).max(50).optional(),
        type: z.string().trim().min(1).max(50).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .strict(),
  })
  .strict();

const readEntityToolCallSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.literal("read_entity"),
    arguments: z
      .object({
        entityType: z.enum([
          "area",
          "project",
          "task",
          "routine",
          "person",
          "reference",
        ]),
        id: entityIdSchema,
      })
      .strict(),
  })
  .strict();

const allClearToolCallSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.literal("all_clear"),
    arguments: z.object({}).strict(),
  })
  .strict();

export const assistantToolCallSchema = z.discriminatedUnion("name", [
  searchToolCallSchema,
  listToolCallSchema,
  readEntityToolCallSchema,
  allClearToolCallSchema,
]);

const assistantModelToolCallSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.enum([
      "search",
      "list_areas",
      "list_projects",
      "list_tasks",
      "list_routines",
      "list_people",
      "list_references",
      "read_entity",
      "all_clear",
    ]),
    argumentsJson: z.string().min(2).max(2_000),
  })
  .strict();

// The model-facing envelope is deliberately one flat object because Codex
// structured output does not accept JSON Schema oneOf. The controller parses
// every argumentsJson string through the stricter discriminated tool schema.
export const assistantStepSchema = z
  .object({
    kind: z.enum(["tool_calls", "final"]),
    calls: z.array(assistantModelToolCallSchema).max(4),
    answer: z.string().max(20_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "tool_calls" && (value.calls.length === 0 || value.answer !== "")) {
      context.addIssue({ code: "custom", message: "Tool steps require calls and an empty answer." });
    }
    if (value.kind === "final" && (value.calls.length !== 0 || value.answer.trim().length === 0)) {
      context.addIssue({ code: "custom", message: "Final steps require only a non-empty answer." });
    }
  });

export function parseAssistantModelToolCall(
  call: z.infer<typeof assistantModelToolCallSchema>,
) {
  let argumentsValue: unknown;
  try {
    argumentsValue = JSON.parse(call.argumentsJson);
  } catch {
    throw new Error("Assistant tool arguments were not valid JSON.");
  }
  return assistantToolCallSchema.parse({
    id: call.id,
    name: call.name,
    arguments: argumentsValue,
  });
}

export const assistantJobInputSchema = z
  .object({
    threadId: uuidSchema,
    turnId: uuidSchema,
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(8_000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export const agentJobClaimSchema = z.discriminatedUnion("kind", [
  z
    .object({
      jobId: uuidSchema,
      leaseToken: z.string().min(32).max(256),
      kind: z.literal("capture_sort"),
      input: sorterJobInputSchema,
    })
    .strict(),
  z
    .object({
      jobId: uuidSchema,
      leaseToken: z.string().min(32).max(256),
      kind: z.literal("assistant_turn"),
      input: assistantJobInputSchema,
    })
    .strict(),
]);

export const agentJobCompletionSchema = z
  .object({
    model: agentModelSchema,
    result: z.unknown(),
  })
  .strict();

export type SorterResult = z.infer<typeof sorterResultSchema>;
export type SorterJobInput = z.infer<typeof sorterJobInputSchema>;
export type AssistantStep = z.infer<typeof assistantStepSchema>;
export type AssistantToolCall = z.infer<typeof assistantToolCallSchema>;
export type AssistantJobInput = z.infer<typeof assistantJobInputSchema>;
export type AgentJobClaim = z.infer<typeof agentJobClaimSchema>;
