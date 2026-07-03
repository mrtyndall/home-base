import { z } from "zod";
import { answerDataQuestion } from "@/lib/chat";

const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8_000),
      }),
    )
    .max(12)
    .optional(),
});

// Read-only data chat. Writes stay capture's job.
export async function POST(request: Request) {
  let parsed;
  try {
    parsed = chatRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await answerDataQuestion(
    parsed.question,
    parsed.history ?? [],
  );

  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 503 });
  }

  return Response.json({ answer: result.answer });
}
