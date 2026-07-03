"use client";

import { useActionState } from "react";
import { sendPushoverTest, type SettingsActionResult } from "@/app/settings/actions";

const idleState: SettingsActionResult = { status: "idle", message: "" };

export function PushoverTestButton() {
  const [state, formAction, pending] = useActionState(sendPushoverTest, idleState);

  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send test notification"}
      </button>
      {state.status !== "idle" ? (
        <p
          className={
            state.status === "sent"
              ? "text-sm text-teal-700"
              : "text-sm text-red-700"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
