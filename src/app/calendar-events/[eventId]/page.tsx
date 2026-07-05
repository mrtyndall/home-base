import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SetupNotice } from "@/components/setup-notice";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type CalendarEventPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function CalendarEventPage({
  params,
}: CalendarEventPageProps) {
  const { eventId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadCalendarEvent(eventId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.event) {
    notFound();
  }

  const { event, people, linkedNotes } = result;

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-3">
        <Link
          href="/today"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          Today
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Meeting
          </p>
          <h1 className="mt-1.5 font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950">
            {event.title}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {formatDateOnly(event.start)} · {formatTime(event.start)}–
            {formatTime(event.end)}
          </p>
        </div>
      </header>

      {people.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            People
          </h2>
          <div className="flex flex-wrap gap-2">
            {people.map((person) => (
              <Link
                key={person.id}
                href={`/people/${person.id}`}
                className="inline-flex h-8 items-center rounded-full border border-[#E2E6DF] bg-white px-3 text-sm font-medium text-teal-700 transition hover:border-teal-700/50"
              >
                @{person.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {event.attendeesList.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Attendees
          </h2>
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {event.attendeesList.map((attendee, index) => (
              <div
                key={`${attendee.email ?? attendee.name}-${index}`}
                className="px-4 py-3"
              >
                <p className="text-sm font-medium text-stone-950">
                  {attendee.name ?? attendee.email ?? "Unknown attendee"}
                </p>
                {attendee.email ? (
                  <p className="mt-0.5 text-xs text-[#9AA096]">
                    {attendee.email}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {linkedNotes.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Linked notes
          </h2>
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {linkedNotes.map((note) => (
              <Link
                key={`${note.type}:${note.id}`}
                href={note.href}
                className="block px-4 py-3 transition hover:bg-[#F7F9F5]"
              >
                <p className="text-sm font-medium text-stone-950">
                  {note.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm text-stone-600">
                  {note.body}
                </p>
                <p className="mt-1 text-xs text-[#B0ACA2]">
                  {note.type} · {formatShortDate(note.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

async function loadCalendarEvent(eventId: string) {
  try {
    const event = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      return { ok: true as const, event: null, people: [], linkedNotes: [] };
    }

    const peopleLinks = await prisma.referenceMention.findMany({
      where: {
        sourceType: "calendar_event",
        sourceId: event.id,
        targetType: "person",
        status: "active",
      },
    });
    const people = await prisma.person.findMany({
      where: { id: { in: peopleLinks.map((link) => link.targetId) } },
      orderBy: { name: "asc" },
    });
    const linkedNotes = await loadEventMentionHistory(event.id);

    return {
      ok: true as const,
      event: { ...event, attendeesList: parseAttendees(event.attendees) },
      people,
      linkedNotes,
    };
  } catch {
    return { ok: false as const };
  }
}

async function loadEventMentionHistory(eventId: string) {
  const mentions = await prisma.referenceMention.findMany({
    where: {
      targetType: "calendar_event",
      targetId: eventId,
      status: "active",
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const idsByType = new Map<string, string[]>();
  for (const mention of mentions) {
    const ids = idsByType.get(mention.sourceType) ?? [];
    ids.push(mention.sourceId);
    idsByType.set(mention.sourceType, ids);
  }

  const [notes, checkIns, references, journals] = await Promise.all([
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
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function parseAttendees(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((attendee) =>
      typeof attendee === "object" && attendee !== null
        ? {
            name:
              "displayName" in attendee &&
              typeof attendee.displayName === "string"
                ? attendee.displayName
                : null,
            email:
              "email" in attendee && typeof attendee.email === "string"
                ? attendee.email
                : null,
          }
        : null,
    )
    .filter(
      (attendee): attendee is { name: string | null; email: string | null } =>
        Boolean(attendee),
    );
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
