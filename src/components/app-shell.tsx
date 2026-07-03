import Link from "next/link";
import {
  CalendarCheck2,
  FolderKanban,
  Lightbulb,
  ListTodo,
  Search,
} from "lucide-react";
import { CaptureBar } from "@/components/capture-bar";

const tabs = [
  { href: "/", label: "Today", icon: CalendarCheck2 },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/search", label: "Search", icon: Search },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
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
