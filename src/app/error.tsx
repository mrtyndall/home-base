"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="py-10">
      <h1 className="font-serif text-[24px] font-medium leading-[1.25] tracking-[-0.01em] text-stone-950">
        This screen hit an error.
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[#6B7268]">
        Your data is safe - captures are written before anything else runs.
        Reload this screen, or head home.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-[34px] items-center rounded-full bg-teal-700 px-4 text-[13px] font-medium text-white transition hover:bg-teal-800"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-[34px] items-center rounded-full border border-[#E2E6DF] bg-white px-4 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
