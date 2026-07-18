"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { dismissCapture } from "@/app/actions";

export function CaptureDismissAction({ captureId }: { captureId: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const keepButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    keepButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
      >
        Dismiss
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[70] bg-stone-950/20 sm:grid sm:place-items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-x-0 bottom-[var(--app-dock-clearance)] rounded-t-[24px] border border-[#E2E6DF] bg-[#FAFBF9] p-4 shadow-[0_-18px_48px_rgba(28,25,23,0.18)] sm:static sm:w-[min(26rem,calc(100vw-3rem))] sm:rounded-[20px] sm:p-5 sm:shadow-[0_18px_54px_rgba(28,25,23,0.20)]"
          >
            <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-300 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id={titleId} className="font-serif text-xl font-medium text-stone-950">
                  Dismiss this capture?
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-stone-600">
                  It will leave your review queue but remain in history.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close dismissal confirmation"
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                ref={keepButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                className="h-11 rounded-full border border-[#D8DDD5] bg-white px-4 text-sm font-medium text-stone-700 hover:border-teal-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              >
                Keep capture
              </button>
              <form action={dismissCapture}>
                <input type="hidden" name="captureId" value={captureId} />
                <button
                  type="submit"
                  className="h-11 w-full rounded-full bg-stone-900 px-4 text-sm font-medium text-white transition hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
                >
                  Dismiss capture
                </button>
              </form>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
