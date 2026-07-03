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
    <div className="space-y-5">
      <header className="space-y-3">
        <Link
          href="/ideas"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={16} />
          Library
        </Link>
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-teal-700">
            Person
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            {person.name}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
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
            <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-stone-700">
              {person.notesMd}
            </p>
          ) : null}
        </div>
      </header>

      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-800">Facts</h2>
        {person.facts.length === 0 ? (
          <p className="text-sm text-stone-500">No facts yet.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {person.facts.map((fact) => (
              <div key={fact.id} className="py-2">
                <p className="text-sm text-stone-800">{fact.factValue}</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {[
                    fact.factType !== "note" ? fact.factType : null,
                    fact.dateRelevant
                      ? formatDateOnly(fact.dateRelevant)
                      : null,
                    fact.recurring ? "recurring" : null,
                    `added ${formatShortDate(fact.createdAt)}`,
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-800">Interactions</h2>
        {person.interactions.length === 0 ? (
          <p className="text-sm text-stone-500">No interactions logged.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {person.interactions.map((interaction) => (
              <div key={interaction.id} className="py-2">
                <p className="text-sm text-stone-800">
                  {interaction.notesMd ?? interaction.interactionType}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {[
                    formatShortDate(interaction.occurredAt),
                    interaction.interactionType,
                    interaction.source,
                  ].join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {linkedCaptures.length > 0 ? (
        <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-base font-semibold text-stone-800">
            Linked captures
          </h2>
          <div className="divide-y divide-stone-100">
            {linkedCaptures.map((capture) => (
              <div key={capture.id} className="py-2">
                <p className="text-sm text-stone-800">{capture.rawText}</p>
                <p className="mt-0.5 text-xs text-stone-500">
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
