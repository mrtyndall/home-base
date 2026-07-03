import { Inbox } from "lucide-react";

export function SetupNotice({ reason }: { reason: string }) {
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <div className="flex items-start gap-3">
        <Inbox className="mt-0.5 shrink-0" size={19} />
        <div>
          <h2 className="text-base font-semibold">Database unavailable</h2>
          <p className="mt-1 text-sm">{reason}</p>
        </div>
      </div>
    </section>
  );
}
