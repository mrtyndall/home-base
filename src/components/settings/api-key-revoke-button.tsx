"use client";

import { useState } from "react";
import { revokeApiKey } from "@/app/settings/actions";

// Two-step confirm: revoking cuts off a live agent, so a stray tap should not
// be enough. Revoke is the only key mutation offered here; there is no delete.
export function ApiKeyRevokeButton({ keyId }: { keyId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-[30px] items-center rounded-full border border-[#E2E6DF] bg-white px-3 text-xs font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-950"
      >
        Revoke
      </button>
    );
  }

  return (
    <form action={revokeApiKey} className="flex items-center gap-1.5">
      <input type="hidden" name="keyId" value={keyId} />
      <button
        type="submit"
        className="inline-flex h-[30px] items-center rounded-full bg-stone-950 px-3 text-xs font-medium text-white transition hover:bg-stone-800"
      >
        Confirm revoke
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="inline-flex h-[30px] items-center rounded-full border border-[#E2E6DF] bg-white px-3 text-xs font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
      >
        Keep
      </button>
    </form>
  );
}
