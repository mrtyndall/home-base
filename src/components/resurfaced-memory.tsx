import { Archive } from "lucide-react";
import {
  annotateResurfacedItem,
  boostResurfacedItem,
  dismissResurfacedItem,
} from "@/app/resurface-actions";
import { formatShortDate } from "@/lib/dates";
import type { ResurfacedItem } from "@/lib/resurfacing";

export function ResurfacedMemory({ item }: { item: ResurfacedItem | null }) {
  if (!item) {
    return null;
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-stone-800">
        <Archive size={16} />
        <h2 className="text-sm font-semibold">
          {item.itemType === "idea" ? "An idea" : "A journal entry"} from{" "}
          {formatShortDate(item.itemDate)}
        </h2>
        <span className="text-xs text-stone-500">{item.ageDays} days ago</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800">
        {item.body}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <details className="relative">
          <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
            Add a thought
          </summary>
          <form
            action={annotateResurfacedItem}
            className="absolute left-0 z-10 mt-2 flex w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-md border border-stone-200 bg-white p-2 shadow-lg"
          >
            <input type="hidden" name="seenId" value={item.seenId} />
            <label className="sr-only" htmlFor="resurface-thought">
              Thought
            </label>
            <input
              id="resurface-thought"
              name="thought"
              required
              className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800"
            >
              Add
            </button>
          </form>
        </details>
        <form action={boostResurfacedItem}>
          <input type="hidden" name="seenId" value={item.seenId} />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
          >
            Boost
          </button>
        </form>
        <form action={dismissResurfacedItem}>
          <input type="hidden" name="seenId" value={item.seenId} />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-stone-600 transition hover:text-stone-950"
          >
            Dismiss
          </button>
        </form>
      </div>
    </section>
  );
}
