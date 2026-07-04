"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, House, Library, ListTodo } from "lucide-react";

const tabs = [
  { href: "/", label: "Home", icon: House },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/ideas", label: "Library", icon: Library },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="rounded-[28px] border border-white/65 bg-[#FAFBF9]/60 px-3 py-1.5 shadow-[0_8px_28px_rgba(28,25,23,0.14)] backdrop-blur-xl backdrop-saturate-150">
      <div className="grid grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
                active
                  ? "text-teal-700"
                  : "text-stone-600 hover:text-stone-950"
              }`}
            >
              <Icon size={19} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
