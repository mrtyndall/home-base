import type { JournalEntry } from "@prisma/client";
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

  const { ideas, journalEntries } = result;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Library</h1>
      </header>
      <JournalSection entries={journalEntries} />
      <h2 className="text-base font-semibold text-stone-800">Ideas</h2>
      <section className="space-y-3">
        {ideas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
            No active ideas.
          </div>
        ) : (
          ideas.map((idea) => (
            <details
              key={idea.id}
              className="rounded-lg border border-stone-200 bg-white p-4"
            >
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
                      {idea.project?.area.domain.name ??
                        idea.area?.domain.name ??
                        "Inbox"}
                      {" / "}
                      {idea.project?.name ?? idea.area?.name ?? idea.status}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold leading-snug">
                      {idea.title}
                    </h2>
                  </div>
                  <p className="text-sm text-stone-500">
                    Updated {formatShortDate(idea.updatedAt)}
                  </p>
                </div>
                {idea.body ? (
                  <p className="mt-3 line-clamp-2 text-sm text-stone-700">
                    {idea.body}
                  </p>
                ) : null}
              </summary>

              <div className="mt-4 space-y-4 border-t border-stone-100 pt-4">
                {idea.body ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Body
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">
                      {idea.body}
                    </p>
                  </div>
                ) : null}
                {idea.notes.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Notes
                    </p>
                    <div className="mt-2 divide-y divide-stone-100">
                      {idea.notes.map((note) => (
                        <div key={note.id} className="py-2">
                          <p className="whitespace-pre-wrap text-sm text-stone-800">
                            {note.body}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            {formatShortDate(note.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                  <span>Status {idea.status}</span>
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

function JournalSection({ entries }: { entries: JournalEntry[] }) {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const key = entry.entryDate.toISOString().slice(0, 10);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-stone-800">Journal</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-stone-500">No journal entries yet.</p>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([date, dateEntries]) => (
            <div key={date} className="space-y-2">
              <h3 className="text-sm font-medium text-stone-600">
                {formatDateOnly(date)}
              </h3>
              {dateEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-lg border border-stone-200 bg-white p-4"
                >
                  <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800">
                    {entry.bodyMd}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                    <span>{entry.source}</span>
                    {entry.tags.length > 0 ? (
                      <span>{entry.tags.join(", ")}</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

async function loadIdeas() {
  try {
    const [ideas, journalEntries] = await Promise.all([
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
    ]);

    return { ok: true as const, ideas, journalEntries };
  } catch {
    return { ok: false as const };
  }
}
