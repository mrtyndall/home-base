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

  const { person, linkedCaptures, linkedMentions } = result;

  return (
    <div className="max-w-2xl space-y-6">
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

      {linkedMentions.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Mentioned here
          </h2>
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {linkedMentions.map((item) => (
              <Link
                key={`${item.type}:${item.id}`}
                href={item.href}
                className="block px-4 py-3 transition hover:bg-[#F7F9F5]"
              >
                <p className="text-sm font-medium text-stone-950">
                  {item.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm text-stone-600">
                  {item.body}
                </p>
                <p className="mt-1 text-xs text-[#B0ACA2]">
                  {item.type} · {formatShortDate(item.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

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
      return {
        ok: true as const,
        person: null,
        linkedCaptures: [],
        linkedMentions: [],
      };
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
    const linkedMentions = await loadPersonMentionHistory(person.id);

    return { ok: true as const, person, linkedCaptures, linkedMentions };
  } catch {
    return { ok: false as const };
  }
}

async function loadPersonMentionHistory(personId: string) {
  const mentions = await prisma.referenceMention.findMany({
    where: { targetType: "person", targetId: personId, status: "active" },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const idsByType = new Map<string, string[]>();
  for (const mention of mentions) {
    const ids = idsByType.get(mention.sourceType) ?? [];
    ids.push(mention.sourceId);
    idsByType.set(mention.sourceType, ids);
  }

  const [notes, checkIns, references, journals, events] = await Promise.all([
    prisma.entityNote.findMany({
      where: { id: { in: idsByType.get("entity_note") ?? [] } },
      select: {
        id: true,
        bodyMd: true,
        parentType: true,
        parentId: true,
        createdAt: true,
      },
    }),
    prisma.checkIn.findMany({
      where: { id: { in: idsByType.get("check_in") ?? [] } },
      select: {
        id: true,
        bodyMd: true,
        parentType: true,
        parentId: true,
        createdAt: true,
      },
    }),
    prisma.reference.findMany({
      where: { id: { in: idsByType.get("reference") ?? [] } },
      select: { id: true, title: true, body: true, createdAt: true },
    }),
    prisma.journalEntry.findMany({
      where: { id: { in: idsByType.get("journal_entry") ?? [] } },
      select: { id: true, bodyMd: true, entryDate: true, createdAt: true },
    }),
    prisma.calendarEvent.findMany({
      where: { id: { in: idsByType.get("calendar_event") ?? [] } },
      select: { id: true, title: true, start: true, createdAt: true },
    }),
  ]);

  return [
    ...notes.map((note) => ({
      id: note.id,
      type: "note",
      title: "Note",
      body: note.bodyMd,
      createdAt: note.createdAt,
      href:
        note.parentType === "area"
          ? `/areas/${note.parentId}`
          : `/projects/${note.parentId}`,
    })),
    ...checkIns.map((checkIn) => ({
      id: checkIn.id,
      type: "check-in",
      title: "Check-in",
      body: checkIn.bodyMd,
      createdAt: checkIn.createdAt,
      href:
        checkIn.parentType === "area"
          ? `/areas/${checkIn.parentId}`
          : `/projects/${checkIn.parentId}`,
    })),
    ...references.map((reference) => ({
      id: reference.id,
      type: "reference",
      title: reference.title ?? "Reference",
      body: reference.body,
      createdAt: reference.createdAt,
      href: `/ideas#reference-${reference.id}`,
    })),
    ...journals.map((entry) => ({
      id: entry.id,
      type: "journal",
      title: formatDateOnly(entry.entryDate),
      body: entry.bodyMd,
      createdAt: entry.createdAt,
      href: "/ideas",
    })),
    ...events.map((event) => ({
      id: event.id,
      type: "meeting",
      title: event.title,
      body: formatDateOnly(event.start),
      createdAt: event.start,
      href: `/calendar-events/${event.id}`,
    })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}
