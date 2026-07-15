import {
  ChatTurnError,
  getAssistantTurnStatus,
  isChatAccessEnabled,
} from "@/lib/agent/chat";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ turnId: string }> },
) {
  if (!isChatAccessEnabled()) {
    return Response.json({ error: "Chat is unavailable." }, { status: 503 });
  }
  const { turnId } = await params;
  const threadId = new URL(request.url).searchParams.get("threadId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(turnId) || !/^[0-9a-f-]{36}$/i.test(threadId)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    return Response.json(await getAssistantTurnStatus(turnId, threadId));
  } catch (error) {
    if (error instanceof ChatTurnError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "Chat status is unavailable." },
      { status: 503 },
    );
  }
}
