import { SearchIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatShortDate } from "@/lib/dates";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  let results:
    | Array<{ type: string; id: string; title: string; detail?: string }>
    | undefined;

  if (query.length > 0) {
    const result = await runSearch(query);
    if (!result.ok) {
      return <SetupNotice reason="Database is not migrated or reachable." />;
    }

    results = result.results;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Search</h1>
      </header>
      <form className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-2">
        <SearchIcon className="ml-2 text-stone-500" size={18} />
        <input
          name="q"
          defaultValue={query}
          placeholder="Search everything"
          className="h-10 min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
        />
      </form>
      <section className="space-y-2">
        {query.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
            Enter a search term.
          </div>
        ) : results?.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
            No results.
          </div>
        ) : (
          results?.map((result) => (
            <article
              key={`${result.type}-${result.id}`}
              className="rounded-lg border border-stone-200 bg-white p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
                {result.type}
              </p>
              <h2 className="mt-1 line-clamp-2 font-medium">{result.title}</h2>
              {result.detail ? (
                <p className="mt-1 text-sm text-stone-500">{result.detail}</p>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

async function runSearch(query: string) {
  try {
    const [captures, tasks, projects, ideas, references, entityNotes, entityDocs, checkIns, journalEntries, people, personFacts] =
      await Promise.all([
      prisma.capture.findMany({
        where: { rawText: { contains: query, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { notes: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.project.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { currentState: { contains: query, mode: "insensitive" } },
            { nextStep: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.idea.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { body: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.reference.findMany({
        where: {
          OR: [
            { body: { contains: query, mode: "insensitive" } },
            { url: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.entityNote.findMany({
        where: { bodyMd: { contains: query, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.entityDoc.findMany({
        where: {
          status: "active",
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { bodyMd: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.checkIn.findMany({
        where: { bodyMd: { contains: query, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.journalEntry.findMany({
        where: { bodyMd: { contains: query, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.person.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { company: { contains: query, mode: "insensitive" } },
            { notesMd: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { name: "asc" },
        take: 20,
      }),
      prisma.personFact.findMany({
        where: { factValue: { contains: query, mode: "insensitive" } },
        include: { person: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const results = [
      ...captures.map((capture) => ({
        type: "Capture",
        id: capture.id,
        title: capture.rawText,
        detail: formatShortDate(capture.createdAt),
      })),
      ...tasks.map((task) => ({
        type: "Task",
        id: task.id,
        title: task.title,
        detail: task.status,
      })),
      ...projects.map((project) => ({
        type: "Project",
        id: project.id,
        title: project.name,
        detail: project.status,
      })),
      ...ideas.map((idea) => ({
        type: "Idea",
        id: idea.id,
        title: idea.title,
        detail: idea.status,
      })),
      ...references.map((reference) => ({
        type: "Reference",
        id: reference.id,
        title: reference.body,
        detail: reference.url ?? undefined,
      })),
      ...entityNotes.map((note) => ({
        type: "Note",
        id: note.id,
        title: note.bodyMd,
        detail: formatShortDate(note.createdAt),
      })),
      ...entityDocs.map((doc) => ({
        type: "Doc",
        id: doc.id,
        title: doc.title,
        detail: formatShortDate(doc.updatedAt),
      })),
      ...checkIns.map((checkIn) => ({
        type: "Check-in",
        id: checkIn.id,
        title: checkIn.bodyMd,
        detail: formatShortDate(checkIn.createdAt),
      })),
      ...journalEntries.map((entry) => ({
        type: "Journal",
        id: entry.id,
        title: entry.bodyMd,
        detail: formatShortDate(entry.entryDate),
      })),
      ...people.map((person) => ({
        type: "Person",
        id: person.id,
        title: person.name,
        detail: person.relationshipType ?? person.company ?? undefined,
      })),
      ...personFacts.map((fact) => ({
        type: "Person fact",
        id: fact.id,
        title: fact.factValue,
        detail: fact.person.name,
      })),
    ].slice(0, 40);

    return { ok: true as const, results };
  } catch {
    return { ok: false as const };
  }
}
