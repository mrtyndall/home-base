import {
  annotateResurfacedItem,
  boostResurfacedItem,
  dismissResurfacedItem,
} from "@/app/resurface-actions";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import type { ResurfacedItem } from "@/lib/resurfacing";

export function ResurfacedMemory({ item }: { item: ResurfacedItem | null }) {
  if (!item) {
    return null;
  }

  return (
    <section className="rounded-[14px] border border-[#E2E6DF] bg-white px-[18px] py-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          {item.itemType === "idea" ? "An idea" : "From your journal"}
        </h2>
        <span className="text-xs text-stone-400">
          {/* Journal entryDate is date-only (UTC midnight) — format in UTC
              or the card shows the previous day. */}
          {item.itemType === "idea"
            ? formatShortDate(item.itemDate)
            : formatDateOnly(item.itemDate)}
          {" · "}
          {item.ageDays} days ago
        </span>
      </div>
      <p className="mt-2.5 whitespace-pre-wrap font-serif text-[17px] leading-[1.55] text-stone-800">
        {item.body}
      </p>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <details className="relative">
          <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
            Add a thought
          </summary>
          <form
            action={annotateResurfacedItem}
            className="absolute left-0 z-10 mt-2 flex w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-[20px] border border-white/65 bg-[#FAFBF9]/75 p-2 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150"
          >
            <input type="hidden" name="seenId" value={item.seenId} />
            <label className="sr-only" htmlFor="resurface-thought">
              Thought
            </label>
            <input
              id="resurface-thought"
              name="thought"
              required
              className="h-9 min-w-0 flex-1 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
            />
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-full bg-teal-700 px-3.5 text-sm font-medium text-white transition hover:bg-teal-800"
            >
              Add
            </button>
          </form>
        </details>
        <form action={boostResurfacedItem}>
          <input type="hidden" name="seenId" value={item.seenId} />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
          >
            Boost
          </button>
        </form>
        <form action={dismissResurfacedItem}>
          <input type="hidden" name="seenId" value={item.seenId} />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium text-stone-500 transition hover:text-stone-950"
          >
            Dismiss
          </button>
        </form>
      </div>
    </section>
  );
}
