"use client";

import type { ProjectStatus } from "@prisma/client";
import type { ReactNode } from "react";
import {
  ArchiveRestore,
  Check,
  Ellipsis,
  Pause,
  Play,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectOverflowMenu({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (status === "completed" || status === "killed") {
    return null;
  }

  async function updateStatus(nextStatus: "active" | "parked" | "completed" | "killed") {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        throw new Error("Project status update failed.");
      }
      if (nextStatus === "completed" || nextStatus === "killed") {
        router.push("/projects");
      } else {
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="relative">
      <summary
        title="Project actions"
        className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-stone-300 hover:text-stone-950 [&::-webkit-details-marker]:hidden"
      >
        <Ellipsis size={17} />
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-44 rounded-md border border-stone-200 bg-white p-1 shadow-lg">
        {status === "active" ? (
          <MenuButton
            disabled={pending}
            label="Park"
            icon={<Pause size={15} />}
            onClick={() => updateStatus("parked")}
          />
        ) : null}
        {status === "parked" ? (
          <MenuButton
            disabled={pending}
            label="Unpark"
            icon={<ArchiveRestore size={15} />}
            onClick={() => updateStatus("active")}
          />
        ) : null}
        {status === "someday" ? (
          <MenuButton
            disabled={pending}
            label="Activate"
            icon={<Play size={15} />}
            onClick={() => updateStatus("active")}
          />
        ) : null}
        <MenuButton
          disabled={pending}
          label="Complete"
          icon={<Check size={15} />}
          onClick={() => updateStatus("completed")}
        />
        <MenuButton
          disabled={pending}
          label="Kill"
          icon={<X size={15} />}
          onClick={() => updateStatus("killed")}
        />
      </div>
    </details>
  );
}

function MenuButton({
  disabled,
  label,
  icon,
  onClick,
}: {
  disabled: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm text-stone-700 transition hover:bg-stone-50 hover:text-stone-950 disabled:cursor-wait disabled:opacity-60"
    >
      {icon}
      {label}
    </button>
  );
}
