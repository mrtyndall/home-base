import Link from "next/link";
import { MessageCircle, Search, Settings } from "lucide-react";
import { CaptureBar } from "@/components/capture-bar";
import { NavTabs } from "@/components/nav-tabs";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <Link
          href="/"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700"
        >
          Home Base
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
          >
            <Search size={15} />
            Search
          </Link>
          <Link
            href="/chat"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
          >
            <MessageCircle size={15} />
            Chat
          </Link>
          <Link
            href="/settings"
            className="grid h-9 w-9 place-items-center rounded-full border border-[#E2E6DF] bg-white text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
            title="Settings"
          >
            <Settings size={15} />
          </Link>
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-44 pt-5 sm:px-6">
        {children}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
          <CaptureBar />
          <NavTabs />
        </div>
      </div>
    </div>
  );
}
