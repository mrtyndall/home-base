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
  const [confirmingKill, setConfirmingKill] = useState(false);

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
    <details
      className="relative"
      onToggle={(event) => {
        if (!event.currentTarget.open) setConfirmingKill(false);
      }}
    >
      <summary
        title="Project actions"
        className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full text-stone-500 transition hover:bg-white hover:text-stone-950 [&::-webkit-details-marker]:hidden"
      >
        <Ellipsis size={17} />
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-44 rounded-[18px] border border-white/65 bg-[#FAFBF9]/80 p-1.5 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150">
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
          label={confirmingKill ? "Confirm kill?" : "Kill"}
          icon={<X size={15} />}
          emphasis={confirmingKill}
          onClick={() => {
            if (confirmingKill) {
              void updateStatus("killed");
            } else {
              setConfirmingKill(true);
            }
          }}
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
  emphasis = false,
}: {
  disabled: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-sm text-stone-700 transition hover:bg-white/85 hover:text-stone-950 disabled:cursor-wait disabled:opacity-60 ${
        emphasis ? "bg-white/90 font-medium text-stone-950" : ""
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
