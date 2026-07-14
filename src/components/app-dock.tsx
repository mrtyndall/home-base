"use client";

import { usePathname } from "next/navigation";
import { CaptureBar } from "@/components/capture-bar";
import { NavTabs } from "@/components/nav-tabs";

export function AppDock() {
  const pathname = usePathname();
  const showCaptureBar = pathname !== "/chat";

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex h-[var(--app-dock-clearance)] items-end px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
        {showCaptureBar ? <CaptureBar /> : null}
        <NavTabs />
      </div>
    </div>
  );
}
