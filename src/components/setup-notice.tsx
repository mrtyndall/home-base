import { Inbox } from "lucide-react";

export function SetupNotice({ reason }: { reason: string }) {
  return (
    <section className="rounded-[14px] border border-amber-300/70 bg-amber-50 p-4 text-amber-950">
      <div className="flex items-start gap-3">
        <Inbox className="mt-0.5 shrink-0 text-amber-800" size={17} />
        <div>
          <h2 className="text-[15px] font-semibold">Database unavailable</h2>
          <p className="mt-1 text-sm leading-relaxed">{reason}</p>
        </div>
      </div>
    </section>
  );
}
