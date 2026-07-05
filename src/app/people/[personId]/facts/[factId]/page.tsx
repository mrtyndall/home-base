import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { updatePersonFact } from "@/app/actions";
import { SetupNotice } from "@/components/setup-notice";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PersonFactPageProps = {
  params: Promise<{ personId: string; factId: string }>;
};

export default async function PersonFactPage({ params }: PersonFactPageProps) {
  const { personId, factId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadPersonFact(personId, factId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.fact) {
    notFound();
  }

  const { fact } = result;
  const relevantDate = fact.dateRelevant?.toISOString().slice(0, 10) ?? "";

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-3">
        <Link
          href={`/people/${fact.person.id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          {fact.person.name}
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Person fact
          </p>
          <h1 className="mt-1.5 font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950">
            {fact.factValue}
          </h1>
          <p className="mt-2 text-sm text-[#9AA096]">
            {[
              fact.factType,
              fact.dateRelevant ? formatDateOnly(fact.dateRelevant) : null,
              fact.recurring ? "recurring" : null,
              `added ${formatShortDate(fact.createdAt)}`,
            ]
              .filter((item): item is string => Boolean(item))
              .join(" · ")}
          </p>
        </div>
      </header>

      <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Edit fact
        </h2>
        <form action={updatePersonFact} className="mt-4 grid gap-3">
          <input type="hidden" name="personId" value={fact.personId} />
          <input type="hidden" name="factId" value={fact.id} />
          <label className="grid gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-[#9AA096]">
            Text
            <textarea
              name="factValue"
              required
              rows={4}
              defaultValue={fact.factValue}
              className="rounded-[12px] border border-[#E2E6DF] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-950 outline-none focus:border-teal-700"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-[#9AA096]">
              Type
              <input
                name="factType"
                defaultValue={fact.factType}
                className="h-10 rounded-[12px] border border-[#E2E6DF] bg-white px-3 text-sm font-normal normal-case tracking-normal text-stone-950 outline-none focus:border-teal-700"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-[#9AA096]">
              Relevant date
              <input
                name="dateRelevant"
                type="date"
                defaultValue={relevantDate}
                className="h-10 rounded-[12px] border border-[#E2E6DF] bg-white px-3 text-sm font-normal normal-case tracking-normal text-stone-950 outline-none focus:border-teal-700"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-stone-700">
              <input
                name="recurring"
                type="checkbox"
                defaultChecked={fact.recurring}
                className="h-4 w-4 accent-teal-700"
              />
              Recurring
            </label>
          </div>
          <button className="h-10 rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800 sm:w-fit">
            Save fact
          </button>
        </form>
      </section>

      {fact.capture ? (
        <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Original capture
          </h2>
          <p className="mt-2 rounded-[12px] bg-[#F7F9F5] px-3 py-2 text-sm leading-relaxed text-stone-800">
            {fact.capture.rawText}
          </p>
          <p className="mt-2 text-xs text-[#B0ACA2]">
            {formatShortDate(fact.capture.createdAt)}
          </p>
        </section>
      ) : null}
    </div>
  );
}

async function loadPersonFact(personId: string, factId: string) {
  try {
    const fact = await prisma.personFact.findFirst({
      where: { id: factId, personId },
      include: {
        person: { select: { id: true, name: true } },
        capture: { select: { rawText: true, createdAt: true } },
      },
    });

    return { ok: true as const, fact };
  } catch {
    return { ok: false as const };
  }
}
