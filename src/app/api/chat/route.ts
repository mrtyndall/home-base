import { answerDataQuestion } from "@/lib/chat";
import {
  ChatTurnError,
  chatRequestSchema,
  completeFallbackAssistantTurn,
  createAssistantTurn,
  createFallbackAssistantTurn,
  failFallbackAssistantTurn,
  isChatAccessEnabled,
} from "@/lib/agent/chat";

// Both paths persist canonical server-owned history. Codex queues a durable,
// read-only worker turn; Claude remains the synchronous fallback.
export async function POST(request: Request) {
  if (!isChatAccessEnabled()) {
    return Response.json({ error: "Chat is unavailable." }, { status: 503 });
  }
  const parsed = chatRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (process.env.HOME_BASE_CODEX_ASSISTANT_ENABLED === "true") {
    try {
      const turn = await createAssistantTurn(parsed.data);
      return Response.json(turn, { status: 202 });
    } catch (error) {
      if (error instanceof ChatTurnError) {
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      }
      return Response.json(
        { error: "The assistant is temporarily unavailable." },
        { status: 503 },
      );
    }
  }

  try {
    const turn = await createFallbackAssistantTurn(parsed.data);
    const result = await answerDataQuestion(
      parsed.data.question,
      turn.history,
    ).catch(async (error: unknown) => {
      await failFallbackAssistantTurn(
        turn.assistantMessageId,
        error instanceof Error
          ? error.message
          : "The answer could not be completed.",
      );
      throw error;
    });
    if (!result.ok) {
      await failFallbackAssistantTurn(turn.assistantMessageId, result.reason);
      return Response.json({ error: result.reason }, { status: 503 });
    }
    await completeFallbackAssistantTurn(turn.assistantMessageId, result.answer);
    return Response.json({ answer: result.answer, threadId: turn.threadId });
  } catch (error) {
    if (error instanceof ChatTurnError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "The assistant is temporarily unavailable." },
      { status: 503 },
    );
  }
}
