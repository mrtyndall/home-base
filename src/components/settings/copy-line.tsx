"use client";

import { useState } from "react";

export function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-1.5 flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-[10px] bg-[#F7F9F5] py-2 pl-2.5 pr-2">
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-stone-600 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {value}
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-teal-700 transition hover:bg-white"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
