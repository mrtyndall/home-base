import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueueAgentJob } from "@/lib/agent/queue";
import {
  assistantJobInputSchema,
  isAgentWorkerEnabled,
  type AssistantJobInput,
} from "@/lib/agent/schemas";

export const ASSISTANT_PROMPT_VERSION = "home-base-assistant-v1";
export const FALLBACK_TURN_STALE_MS = 5 * 60 * 1_000;

export function isChatAccessEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.HOME_BASE_CHAT_ENABLED === "true";
}

export const chatRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    threadId: z.string().uuid().optional(),
  })
  .strict();

export async function createAssistantTurn(
  input: z.infer<typeof chatRequestSchema>,
) {
  if (!isAgentWorkerEnabled("assistant")) {
    throw new ChatTurnError("The Codex assistant is disabled.", 503);
  }
  const turn = await prisma.$transaction((client) =>
    createCanonicalTurn(client, input, true),
  );
  return {
    threadId: turn.threadId,
    turnId: turn.assistantMessageId,
    status: "queued" as const,
  };
}

export async function createFallbackAssistantTurn(
  input: z.infer<typeof chatRequestSchema>,
) {
  return prisma.$transaction((client) =>
    createCanonicalTurn(client, input, false),
  );
}

async function createCanonicalTurn(
  client: Prisma.TransactionClient,
  input: z.infer<typeof chatRequestSchema>,
  shouldEnqueue: boolean,
) {
  const thread = input.threadId
    ? await client.chatThread.findUnique({ where: { id: input.threadId } })
    : await client.chatThread.create({
        data: { title: input.question.slice(0, 100) },
      });
  if (!thread) throw new ChatTurnError("Chat thread was not found.", 404);

  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${thread.id}, 0))`;
  const latest = await client.chatMessage.findFirst({
    where: { threadId: thread.id },
    orderBy: { sequence: "desc" },
    select: {
      id: true,
      sequence: true,
      role: true,
      status: true,
      updatedAt: true,
      agentJob: { select: { status: true } },
    },
  });
  if (latest?.role === "assistant" && latest.status === "pending") {
    const terminalWorkerTurn = latest.agentJob?.status === "dead_letter";
    const staleFallbackTurn =
      !latest.agentJob &&
      latest.updatedAt.getTime() <= Date.now() - FALLBACK_TURN_STALE_MS;
    if (!terminalWorkerTurn && !staleFallbackTurn) {
      throw new ChatTurnError("The previous answer is still running.", 409);
    }
    await client.chatMessage.updateMany({
      where: { id: latest.id, role: "assistant", status: "pending" },
      data: {
        status: "failed",
        error: "Previous answer was interrupted. Try again.",
      },
    });
  }
  const nextSequence = (latest?.sequence ?? 0) + 1;
  const history = await client.chatMessage.findMany({
    where: {
      threadId: thread.id,
      sequence: { lt: nextSequence },
      status: "completed",
      content: { not: "" },
    },
    orderBy: { sequence: "desc" },
    take: 8,
    select: { role: true, content: true },
  });
  await client.chatMessage.create({
    data: {
      threadId: thread.id,
      sequence: nextSequence,
      role: "user",
      status: "completed",
      content: input.question,
    },
  });
  const assistantMessage = await client.chatMessage.create({
    data: {
      threadId: thread.id,
      sequence: nextSequence + 1,
      role: "assistant",
      status: "pending",
      content: "",
    },
  });
  if (shouldEnqueue) {
    await enqueueAgentJob(
      {
        role: "assistant",
        kind: "assistant_turn",
        idempotencyKey: `assistant-turn:${assistantMessage.id}:${ASSISTANT_PROMPT_VERSION}`,
        payload: {
          threadId: thread.id,
          assistantMessageId: assistantMessage.id,
        },
        chatMessageId: assistantMessage.id,
        promptVersion: ASSISTANT_PROMPT_VERSION,
      },
      client,
    );
  }
  await client.chatThread.update({
    where: { id: thread.id },
    data: { updatedAt: new Date() },
  });
  return {
    threadId: thread.id,
    assistantMessageId: assistantMessage.id,
    history: history.reverse().map((message) => ({
      ...message,
      content: toAssistantHistoryContent(message.content),
    })),
  };
}

export async function buildAssistantJobInput(
  assistantMessageId: string,
): Promise<AssistantJobInput> {
  const message = await prisma.chatMessage.findFirst({
    where: {
      id: assistantMessageId,
      role: "assistant",
      status: "pending",
    },
    select: {
      id: true,
      threadId: true,
      sequence: true,
    },
  });
  if (!message) throw new Error("Assistant turn is no longer pending.");

  const messages = await prisma.chatMessage.findMany({
    where: {
      threadId: message.threadId,
      sequence: { lt: message.sequence },
      status: "completed",
      content: { not: "" },
    },
    orderBy: { sequence: "desc" },
    take: 20,
    select: { role: true, content: true },
  });

  return assistantJobInputSchema.parse({
    threadId: message.threadId,
    turnId: message.id,
    messages: messages.reverse().map((historyMessage) => ({
      ...historyMessage,
      content: toAssistantHistoryContent(historyMessage.content),
    })),
  });
}

export function toAssistantHistoryContent(content: string) {
  const trimmed = content.trim();
  return trimmed.length <= 8_000 ? trimmed : `${trimmed.slice(0, 7_999)}…`;
}

export async function getAssistantTurnStatus(turnId: string, threadId: string) {
  const message = await prisma.chatMessage.findFirst({
    where: { id: turnId, threadId, role: "assistant" },
    select: {
      id: true,
      status: true,
      content: true,
      error: true,
      updatedAt: true,
    },
  });
  if (!message) throw new ChatTurnError("Chat turn was not found.", 404);
  return {
    turnId: message.id,
    status: message.status,
    answer: message.status === "completed" ? message.content : undefined,
    error:
      message.status === "failed"
        ? (message.error ?? "The answer could not be completed.")
        : undefined,
    updatedAt: message.updatedAt.toISOString(),
  };
}

export async function completeAssistantMessage(
  messageId: string,
  answer: string,
  client: Prisma.TransactionClient,
) {
  const parsed = z.string().trim().min(1).max(20_000).parse(answer);
  const updated = await client.chatMessage.updateMany({
    where: { id: messageId, role: "assistant", status: "pending" },
    data: { status: "completed", content: parsed, error: null },
  });
  if (updated.count !== 1)
    throw new Error("Assistant message is no longer pending.");
}

export async function failAssistantMessage(
  messageId: string,
  error: string,
  client: Prisma.TransactionClient,
) {
  await client.chatMessage.updateMany({
    where: { id: messageId, role: "assistant", status: "pending" },
    data: {
      status: "failed",
      error: error.trim().slice(0, 500) || "The answer could not be completed.",
    },
  });
}

export async function completeFallbackAssistantTurn(
  messageId: string,
  answer: string,
) {
  await prisma.$transaction((client) =>
    completeAssistantMessage(messageId, answer, client),
  );
}

export async function failFallbackAssistantTurn(
  messageId: string,
  error: string,
) {
  await prisma.$transaction((client) =>
    failAssistantMessage(messageId, error, client),
  );
}

export class ChatTurnError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
