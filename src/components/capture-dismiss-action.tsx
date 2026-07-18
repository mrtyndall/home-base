"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { dismissCapture } from "@/app/actions";

export function CaptureDismissAction({ captureId }: { captureId: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);

  const closeDialog = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    keepButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDialog();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog, open]);

  function keepFocusInside(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
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
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={keepFocusInside}
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
                onClick={closeDialog}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                ref={keepButtonRef}
                type="button"
                onClick={closeDialog}
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
