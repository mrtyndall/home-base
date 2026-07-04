"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { SendHorizonal } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function ChatSurface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ask = () => {
    const question = input.trim();
    if (!question || pending) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: question },
    ];
    setMessages(nextMessages);
    setInput("");
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            history: messages.slice(-8),
          }),
        });
        const payload = (await response.json()) as {
          answer?: string;
          error?: string;
        };
        if (!response.ok || !payload.answer) {
          setError(payload.error ?? "Chat failed.");
          return;
        }
        setMessages([
          ...nextMessages,
          { role: "assistant", content: payload.answer },
        ]);
      } catch {
        setError("Chat failed. Your question was not lost — try again.");
      }
    });
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
