import type { JournalEntry, Person } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadIdeas();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { ideas, journalEntries, people } = result;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          Library
        </h1>
      </header>
      <JournalSection entries={journalEntries} />
      <PeopleSection people={people} />
      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Ideas
        </h2>
        {ideas.length === 0 ? (
          <p className="text-sm text-[#6B7268]">No active ideas.</p>
        ) : (
          ideas.map((idea) => (
            <details
              key={idea.id}
              className="rounded-[14px] border border-[#E2E6DF] bg-white p-4"
            >
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
                      {idea.project?.area.domain.name ??
                        idea.area?.domain.name ??
                        "Inbox"}
                      {" / "}
                      {idea.project?.name ?? idea.area?.name ?? idea.status}
                    </p>
                    <h2 className="mt-1 text-[16px] font-medium leading-snug text-stone-950">
                      {idea.title}
                    </h2>
                  </div>
                  <p className="text-xs text-[#9AA096]">
                    {formatShortDate(idea.updatedAt)}
                  </p>
                </div>
                {idea.body ? (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-600">
                    {idea.body}
                  </p>
                ) : null}
              </summary>

              <div className="mt-3.5 space-y-3.5 border-t border-[#EEF1EC] pt-3.5">
                {idea.body ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
                      Body
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">
                      {idea.body}
                    </p>
                  </div>
                ) : null}
                {idea.notes.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
                      Notes
                    </p>
                    <div className="mt-2 divide-y divide-[#EEF1EC]">
                      {idea.notes.map((note) => (
                        <div key={note.id} className="py-2">
                          <p className="whitespace-pre-wrap text-sm text-stone-800">
                            {note.body}
                          </p>
                          <p className="mt-1 text-xs text-[#9AA096]">
                            {formatShortDate(note.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9AA096]">
                  <span>{idea.status}</span>
                  <span>Created {formatShortDate(idea.createdAt)}</span>
                  {idea.captureId ? <span>Linked capture</span> : null}
                  {idea.tags.length > 0 ? <span>{idea.tags.join(", ")}</span> : null}
                </div>
              </div>
            </details>
          ))
        )}
      </section>
    </div>
  );
}

function PeopleSection({
  people,
}: {
  people: Array<Person & { _count: { facts: number; interactions: number } }>;
}) {
  if (people.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        People
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {people.map((person) => (
          <Link
            key={person.id}
            href={`/people/${person.id}`}
            className="rounded-[14px] border border-[#E2E6DF] bg-white px-[15px] py-[13px] transition hover:border-teal-700/50"
          >
            <p className="text-sm font-medium text-stone-950">{person.name}</p>
            <p className="mt-0.5 text-xs text-[#9AA096]">
              {[
                person.relationshipType,
                person.company,
                person._count.facts > 0
                  ? `${person._count.facts} fact${person._count.facts === 1 ? "" : "s"}`
                  : null,
                person._count.interactions > 0
                  ? `${person._count.interactions} interaction${person._count.interactions === 1 ? "" : "s"}`
                  : null,
              ]
                .filter((item): item is string => Boolean(item))
                .join(" · ")}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function JournalSection({ entries }: { entries: JournalEntry[] }) {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const key = entry.entryDate.toISOString().slice(0, 10);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return (
    <section className="space-y-3.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Journal
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-[#6B7268]">No journal entries yet.</p>
      ) : (
        <div className="max-w-2xl">
          {Array.from(groups.entries()).map(([date, dateEntries], index) => (
            <div key={date}>
              {index > 0 ? <div className="my-[18px] h-px bg-[#DDE2DA]" /> : null}
              <h3 className="font-serif text-[15px] italic text-stone-500">
                {formatDateOnly(date)}
              </h3>
              <div className="space-y-4">
                {dateEntries.map((entry) => (
                  <article key={entry.id}>
                    <p className="mt-2 whitespace-pre-wrap font-serif text-[17px] leading-[1.65] text-stone-800">
                      {entry.bodyMd}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#B0ACA2]">
                      <span>{entry.source}</span>
                      {entry.tags.length > 0 ? (
                        <span>{entry.tags.join(" · ")}</span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

async function loadIdeas() {
  try {
    const [ideas, journalEntries, people] = await Promise.all([
      prisma.idea.findMany({
        where: { status: { in: ["seed", "developing"] } },
        include: {
          area: { include: { domain: true } },
          project: { include: { area: { include: { domain: true } } } },
          notes: { orderBy: { createdAt: "desc" }, take: 6 },
        },
        orderBy: { updatedAt: "desc" },
        take: 80,
      }),
      prisma.journalEntry.findMany({
        where: { status: "active" },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        take: 60,
      }),
      prisma.person.findMany({
        where: { status: "active" },
        include: { _count: { select: { facts: true, interactions: true } } },
        orderBy: { name: "asc" },
        take: 100,
      }),
    ]);

    return { ok: true as const, ideas, journalEntries, people };
  } catch {
    return { ok: false as const };
  }
}
