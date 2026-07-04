import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SetupNotice } from "@/components/setup-notice";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PersonPageProps = {
  params: Promise<{ personId: string }>;
};

export default async function PersonPage({ params }: PersonPageProps) {
  const { personId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadPerson(personId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.person) {
    notFound();
  }

  const { person, linkedCaptures } = result;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/ideas"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          Library
        </Link>
        <div>
          <h1 className="font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950">
            {person.name}
          </h1>
          <p className="mt-1.5 text-[13px] text-stone-500">
            {[
              person.relationshipType,
              person.company,
              person.email,
              person.phone,
              person.status !== "active" ? person.status : null,
            ]
              .filter((item): item is string => Boolean(item))
              .join(" · ")}
          </p>
          {person.notesMd?.trim() ? (
            <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
              {person.notesMd}
            </p>
          ) : null}
        </div>
      </header>

      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Facts
        </h2>
        {person.facts.length === 0 ? null : (
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {person.facts.map((fact) => {
              const dateLead = [
                fact.dateRelevant ? formatDateOnly(fact.dateRelevant) : null,
                fact.recurring ? "recurring" : null,
              ]
                .filter((item): item is string => Boolean(item))
                .join(" · ");
              const trail = [
                fact.factType !== "note" ? fact.factType : null,
                `added ${formatShortDate(fact.createdAt)}`,
              ]
                .filter((item): item is string => Boolean(item))
                .join(" · ");
              return (
                <div key={fact.id} className="px-4 py-3">
                  {dateLead ? (
                    <p className="text-xs text-[#9AA096]">{dateLead}</p>
                  ) : null}
                  <p
                    className={`text-[15px] text-stone-950 ${dateLead ? "mt-0.5" : ""}`}
                  >
                    {fact.factValue}
                  </p>
                  <p className="mt-0.5 text-xs text-[#B0ACA2]">{trail}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Interactions
        </h2>
        {person.interactions.length === 0 ? null : (
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {person.interactions.map((interaction) => (
              <div
                key={interaction.id}
                className="flex items-baseline gap-3 px-4 py-3"
              >
                <span className="min-w-[46px] text-xs text-[#9AA096]">
                  {formatShortDate(interaction.occurredAt)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-stone-950">
                    {interaction.notesMd ?? interaction.interactionType}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#B0ACA2]">
                    {interaction.source === "calendar"
                      ? "from calendar"
                      : interaction.source === "capture"
                        ? "from capture"
                        : "noted by hand"}
                    {interaction.notesMd
                      ? ` · ${interaction.interactionType}`
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {linkedCaptures.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Linked captures
          </h2>
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {linkedCaptures.map((capture) => (
              <div key={capture.id} className="px-4 py-3">
                <p className="rounded-[10px] bg-[#F7F9F5] px-3 py-2 text-sm leading-relaxed text-stone-800">
                  {capture.rawText}
                </p>
                <p className="mt-1.5 text-xs text-[#B0ACA2]">
                  {formatShortDate(capture.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

async function loadPerson(personId: string) {
  try {
    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: {
        facts: { orderBy: { createdAt: "desc" }, take: 50 },
        interactions: { orderBy: { occurredAt: "desc" }, take: 50 },
      },
    });

    if (!person) {
      return { ok: true as const, person: null, linkedCaptures: [] };
    }

    const captureIds = [
      ...person.facts.map((fact) => fact.captureId),
      ...person.interactions.map((interaction) => interaction.captureId),
    ].filter((id): id is string => Boolean(id));

    const linkedCaptures = captureIds.length
      ? await prisma.capture.findMany({
          where: { id: { in: captureIds } },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [];

    return { ok: true as const, person, linkedCaptures };
  } catch {
    return { ok: false as const };
  }
}
