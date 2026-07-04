"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Star } from "lucide-react";

export function HomeTaskActions({
  taskId,
  starred,
}: {
  taskId: string;
  starred: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function run(path: string, init?: RequestInit) {
    setPending(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        ...init,
      });
      if (response.ok) {
        startTransition(() => router.refresh());
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 ${pending ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        title={starred ? "Unstar task" : "Star task"}
        disabled={pending}
        onClick={() =>
          run(`/api/tasks/${taskId}/star`, {
            body: JSON.stringify({ starred: !starred }),
          })
        }
        className="grid h-8 w-8 place-items-center rounded-full border border-[#E2E6DF] bg-white text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 disabled:pointer-events-none"
      >
        <Star
          size={16}
          className={starred ? "fill-teal-600 text-teal-600" : undefined}
        />
      </button>
      <button
        type="button"
        title="Complete task"
        disabled={pending}
        onClick={() => run(`/api/tasks/${taskId}/complete`)}
        className="grid h-8 w-8 place-items-center rounded-full border border-[#E2E6DF] bg-white text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 disabled:pointer-events-none"
      >
        <Check size={16} />
      </button>
    </div>
  );
}

export function HomeRoutineCheck({
  routineId,
  name,
  completed = false,
}: {
  routineId: string;
  name: string;
  completed?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle() {
    setPending(true);
    try {
      const action = completed ? "undo" : "complete";
      const response = await fetch(`/api/routines/${routineId}/${action}`, {
        method: "POST",
      });
      if (response.ok) {
        startTransition(() => router.refresh());
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      title={completed ? `Uncheck ${name}` : `Complete ${name}`}
      disabled={pending}
      onClick={toggle}
      className={`inline-flex h-8 items-center rounded-full border bg-white px-3 text-sm transition disabled:pointer-events-none disabled:opacity-60 ${
        completed
          ? "border-teal-700/30 text-teal-800 hover:border-teal-700"
          : "border-[#E2E6DF] text-stone-700 hover:border-teal-700/50 hover:text-teal-700"
      }`}
    >
      {name}
    </button>
  );
}
