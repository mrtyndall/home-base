import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { createArea } from "@/app/actions";

export default function NewAreaPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-stone-600 transition hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
        >
          <ArrowLeft size={15} />
          Areas
        </Link>
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Ongoing parts of life
          </p>
          <h1 className="mt-1.5 font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
            New area
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7268]">
            Areas hold the parts of life you keep tending, without a finish
            line.
          </p>
        </div>
      </header>

      <form
        action={createArea}
        className="max-w-2xl rounded-[18px] border border-[#E2E6DF] bg-white p-5 shadow-[0_2px_8px_rgba(28,25,23,0.04)] sm:p-6"
      >
        <label className="block">
          <span className="text-[13px] font-medium text-stone-600">
            Area name
          </span>
          <input
            name="name"
            required
            autoFocus
            autoComplete="off"
            placeholder="Home, Health, Creative work…"
            className="mt-2 w-full border-0 border-b border-[#D8DDD5] bg-transparent px-0 py-3 font-serif text-[26px] leading-tight text-stone-950 outline-none transition placeholder:text-stone-300 focus:border-teal-700 sm:text-[32px]"
          />
        </label>
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-teal-700 px-[18px] text-sm font-medium text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <Plus size={14} />
            Create area
          </button>
        </div>
      </form>
    </div>
  );
}
