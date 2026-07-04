"use client";

import { useActionState } from "react";
import {
  sendPushoverTest,
  type SettingsActionResult,
} from "@/app/settings/actions";

const idleState: SettingsActionResult = { status: "idle", message: "" };

export function PushoverTestButton() {
  const [state, formAction, pending] = useActionState(
    sendPushoverTest,
    idleState,
  );

  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send test notification"}
      </button>
      {state.status !== "idle" ? (
        <p
          className={
            state.status === "sent"
              ? "text-[13px] text-teal-700"
              : "text-[13px] text-amber-800"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
