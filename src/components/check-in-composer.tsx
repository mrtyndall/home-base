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
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
        >
          <MessageSquarePlus size={14} />
          Check in
        </button>
        {notice ? <p className="text-[13px] text-[#6B7268]">{notice}</p> : null}
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
    <div className="w-full space-y-2.5 rounded-[14px] border border-[#E2E6DF] bg-white p-3">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        autoFocus
        aria-label="Check-in"
        className="w-full rounded-[12px] border border-[#E2E6DF] bg-white px-3.5 py-2.5 text-sm leading-relaxed outline-none transition focus:border-teal-700"
      />
      {notice ? <p className="text-[13px] text-[#6B7268]">{notice}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={post}
          disabled={pending || text.trim().length === 0}
          className="inline-flex h-9 items-center justify-center rounded-full bg-teal-700 px-4 text-[13px] font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
        >
          Post check-in
        </button>
        <button
          type="button"
          onClick={generateDraft}
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 disabled:opacity-50"
        >
          <Sparkles size={13} />
          {pending ? "Working…" : "AI draft"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setNotice(null);
          }}
          disabled={pending}
          className="inline-flex h-9 items-center justify-center px-2.5 text-[13px] font-medium text-stone-500 transition hover:text-stone-950"
        >
          Close
        </button>
      </div>
    </div>
  );
}
