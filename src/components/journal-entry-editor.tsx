"use client";

import { useState } from "react";
import { updateJournalEntry } from "@/app/actions";
import { MarkdownPreview } from "@/components/markdown-preview";

export function JournalEntryEditor({
  entryId,
  entryDate,
  bodyMd,
  tagsText,
}: {
  entryId: string;
  entryDate: string;
  bodyMd: string;
  tagsText: string;
}) {
  const [draft, setDraft] = useState(bodyMd);

  return (
    <details className="mt-3 rounded-[14px] border border-[#EEF1EC] bg-[#F7F9F5] p-3">
      <summary className="cursor-pointer list-none text-[13px] font-medium text-stone-600 transition hover:text-teal-700 [&::-webkit-details-marker]:hidden">
        Edit
      </summary>
      <form action={updateJournalEntry} className="mt-3 space-y-3">
        <input type="hidden" name="entryId" value={entryId} />
        <div className="grid gap-2 sm:grid-cols-[11rem_1fr]">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Date
            </span>
            <input
              type="date"
              name="entryDate"
              required
              defaultValue={entryDate}
              className="h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none focus:border-teal-700"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Tags
            </span>
            <input
              name="tags"
              defaultValue={tagsText}
              className="h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none focus:border-teal-700"
            />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Markdown
            </span>
            <textarea
              name="bodyMd"
              required
              rows={12}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-64 w-full rounded-[14px] border border-[#E2E6DF] bg-white px-3.5 py-3 font-mono text-sm leading-relaxed outline-none focus:border-teal-700"
            />
          </label>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Preview
            </p>
            <div className="min-h-64 rounded-[14px] border border-[#E2E6DF] bg-white p-3.5">
              <MarkdownPreview body={draft} />
            </div>
          </div>
        </div>
        <button className="inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-5 text-sm font-medium text-white transition hover:bg-teal-800">
          Save journal entry
        </button>
      </form>
    </details>
  );
}
