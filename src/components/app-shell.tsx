import Link from "next/link";
import {
  CalendarCheck2,
  FolderKanban,
  House,
  Library,
  ListTodo,
  MessageCircle,
  Search,
  Settings,
} from "lucide-react";
import { CaptureBar } from "@/components/capture-bar";

const tabs = [
  { href: "/", label: "Home", icon: House },
  { href: "/today", label: "Today", icon: CalendarCheck2 },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/ideas", label: "Library", icon: Library },
];

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
            className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
          >
            <Search size={16} />
            Search
          </Link>
          <Link
            href="/chat"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
          >
            <MessageCircle size={16} />
            Chat
          </Link>
          <Link
            href="/settings"
            className="grid h-9 w-9 place-items-center rounded-md border border-stone-300 bg-white text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
            title="Settings"
          >
            <Settings size={16} />
          </Link>
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-40 pt-5 sm:px-6">
        {children}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20">
        <nav className="border-t border-stone-200 bg-white/95 px-2 py-2 shadow-[0_-6px_20px_rgba(30,41,59,0.08)] backdrop-blur">
          <div className="mx-auto grid max-w-4xl grid-cols-5 gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        <CaptureBar />
      </div>
    </div>
  );
}
