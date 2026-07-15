"use client";

import Link from "next/link";
import { useState } from "react";
import { SendHorizonal } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function ChatSurface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  const ask = async () => {
    const question = input.trim();
    if (!question || pending) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: question },
    ];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, threadId: threadId ?? undefined }),
      });
      const payload = (await response.json()) as {
        answer?: string;
        error?: string;
        threadId?: string;
        turnId?: string;
        status?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Chat failed.");
        return;
      }
      if (payload.threadId) setThreadId(payload.threadId);
      let answer = payload.answer;
      if (
        !answer &&
        payload.threadId &&
        payload.turnId &&
        response.status === 202
      ) {
        answer = await waitForTurn(payload.threadId, payload.turnId);
      }
      if (!answer) {
        setError("The assistant returned an empty answer.");
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chat failed. Try again.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#E3EAE3] px-3.5 py-2.5 text-sm text-stone-950"
                : "max-w-[88%] rounded-2xl rounded-bl-md border border-[#E2E6DF] bg-white px-[15px] py-3 text-sm text-stone-800"
            }
          >
            <MessageBody content={message.content} />
          </div>
        ))}
        {pending ? (
          <p className="pl-1 text-[13px] text-[#9AA096]">Looking that up…</p>
        ) : null}
        {error ? (
          <p className="pl-1 text-[13px] text-amber-800">{error}</p>
        ) : null}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
        className="flex items-center gap-2 rounded-full border border-[#E2E6DF] bg-white p-1.5 pl-4 transition focus-within:border-teal-700"
      >
        <label className="sr-only" htmlFor="chat-question">
          Question
        </label>
        <input
          id="chat-question"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        <button
          type="submit"
          title="Ask"
          disabled={pending || input.trim().length === 0}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800 disabled:opacity-50"
        >
          <SendHorizonal size={16} />
        </button>
      </form>
    </div>
  );
}

async function waitForTurn(threadId: string, turnId: string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(750 + attempt * 75, 2_000)),
      );
    }
    const response = await fetch(
      `/api/chat/turns/${encodeURIComponent(turnId)}?threadId=${encodeURIComponent(threadId)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as {
      status?: "pending" | "completed" | "failed";
      answer?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? "Chat status failed.");
    if (payload.status === "completed" && payload.answer) return payload.answer;
    if (payload.status === "failed")
      throw new Error(payload.error ?? "Chat failed. Try again.");
  }
  throw new Error(
    "The answer is taking longer than expected. It is still queued in Home Base.",
  );
}

/** Renders assistant markdown links as app links; everything else as text. */
function MessageBody({ content }: { content: string }) {
  const parts = content.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <p className="whitespace-pre-wrap leading-6">
      {parts.map((part, index) => {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (!match) {
          return <span key={index}>{part}</span>;
        }
        const [, label, href] = match;
        const safeHref =
          href.startsWith("/") && !href.startsWith("//") ? href : null;
        if (!safeHref) {
          return <span key={index}>{label}</span>;
        }
        return (
          <Link
            key={index}
            href={safeHref}
            className="font-medium text-teal-700 underline-offset-4 hover:underline"
          >
            {label}
          </Link>
        );
      })}
    </p>
  );
}
