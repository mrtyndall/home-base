"use client";

import { useState, useTransition } from "react";
import { MessageSquarePlus, Sparkles } from "lucide-react";
import { postCheckIn, requestCheckInDraft } from "@/app/checkin-actions";

export function CheckInComposer({
  parentType,
  parentId,
}: {
  parentType: "area" | "project";
  parentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setNotice(null);
          }}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
        >
          <MessageSquarePlus size={15} />
          Check in
        </button>
        {notice ? <p className="text-sm text-stone-500">{notice}</p> : null}
      </div>
    );
  }

  const post = () => {
    startTransition(async () => {
      const result = await postCheckIn({
        parentType,
        parentId,
        bodyMd: text,
        draft,
      });
      if (result.ok) {
        setText("");
        setDraft(null);
        setOpen(false);
        setNotice("Check-in posted.");
      } else {
        setNotice(result.message);
      }
    });
  };

  const generateDraft = () => {
    startTransition(async () => {
      const result = await requestCheckInDraft({ parentType, parentId });
      if (result.ok) {
        setDraft(result.draft);
        setText(result.draft);
        setNotice("Draft ready. Edit as needed, then post.");
      } else {
        setNotice(result.reason);
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-3">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        autoFocus
        aria-label="Check-in"
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      {notice ? <p className="text-sm text-stone-500">{notice}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={post}
          disabled={pending || text.trim().length === 0}
          className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
        >
          Post check-in
        </button>
        <button
          type="button"
          onClick={generateDraft}
          disabled={pending}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700 disabled:opacity-50"
        >
          <Sparkles size={14} />
          {pending ? "Working…" : "AI draft"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setNotice(null);
          }}
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          Close
        </button>
      </div>
    </div>
  );
}
