import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatShortDate } from "@/lib/dates";
import { SetupNotice } from "@/components/setup-notice";
import { toReferenceSearchResult } from "@/lib/reference-search-result";
import {
  MIN_SEARCH_QUERY_LENGTH,
  mergeSearchCandidates,
  rankSearchResults,
  searchResultHref,
  strongTextWhere,
  type SearchCandidate,
} from "@/lib/search-results";
import type { Prisma } from "@prisma/client";

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
    | Array<{
        type: string;
        id: string;
        title: string;
        detail?: string;
        href: string;
      }>
    | undefined;

  if (query.length >= MIN_SEARCH_QUERY_LENGTH) {
    const result = await runSearch(query);
    if (!result.ok) {
      return <SetupNotice reason="Database is not migrated or reachable." />;
    }

    results = result.results;
  }

  return (
    <div className="max-w-2xl space-y-5">
      <header>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          Search
        </h1>
      </header>
      <form className="flex h-11 items-center gap-2.5 rounded-full border border-[#E2E6DF] bg-white px-4 transition focus-within:border-teal-700">
        <SearchIcon className="shrink-0 text-[#9AA096]" size={16} />
        <input
          name="q"
          defaultValue={query}
          minLength={MIN_SEARCH_QUERY_LENGTH}
          placeholder="Search everything"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </form>
      <section className="space-y-2.5">
        {query.length === 0 ? null : query.length < MIN_SEARCH_QUERY_LENGTH ? (
          <p className="text-sm text-[#6B7268]">Type at least {MIN_SEARCH_QUERY_LENGTH} characters.</p>
        ) : results?.length === 0 ? (
          <p className="text-sm text-[#6B7268]">No results.</p>
        ) : (
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {results?.map((result) => (
              <Link
                key={`${result.type}-${result.id}`}
                href={result.href}
                className="block min-h-11 px-4 py-3 transition hover:bg-[#F6F7F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700"
              >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
                    {result.type}
                  </p>
                  <h2 className="mt-0.5 line-clamp-2 break-words text-sm font-medium text-stone-950">
                    {result.title}
                  </h2>
                  {result.detail ? (
                    <p className="mt-0.5 break-words text-xs text-[#9AA096]">
                      {result.detail}
                    </p>
                  ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function runSearch(query: string) {
  try {
    const [
      captures,
      tasks,
      projects,
      ideas,
      references,
      referenceSnippets,
      entityNotes,
      entityDocs,
      checkIns,
      journalEntries,
      people,
      personFacts,
    ] = await Promise.all([
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
            { title: { contains: query, mode: "insensitive" } },
            { body: { contains: query, mode: "insensitive" } },
            { url: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.referenceSnippet.findMany({
        where: {
          OR: [
            { quote: { contains: query, mode: "insensitive" } },
            { note: { contains: query, mode: "insensitive" } },
          ],
        },
        include: { reference: { select: { title: true, body: true } } },
        orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
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
        include: { person: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    // A small exact/prefix band prevents an older strong match from being
    // discarded by each model's broader, recent-first twenty-row window.
    const [
      strongCaptures,
      strongTasks,
      strongProjects,
      strongIdeas,
      strongReferences,
      strongReferenceSnippets,
      strongEntityNotes,
      strongEntityDocs,
      strongCheckIns,
      strongJournalEntries,
      strongPeople,
      strongPersonFacts,
    ] = await Promise.all([
      prisma.capture.findMany({ where: strongTextWhere<Prisma.CaptureWhereInput>("rawText", query), orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.task.findMany({ where: strongTextWhere<Prisma.TaskWhereInput>("title", query), orderBy: { updatedAt: "desc" }, take: 8 }),
      prisma.project.findMany({ where: strongTextWhere<Prisma.ProjectWhereInput>("name", query), orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.idea.findMany({ where: strongTextWhere<Prisma.IdeaWhereInput>("title", query), orderBy: { updatedAt: "desc" }, take: 8 }),
      prisma.reference.findMany({ where: strongTextWhere<Prisma.ReferenceWhereInput>("title", query), orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.referenceSnippet.findMany({ where: strongTextWhere<Prisma.ReferenceSnippetWhereInput>("quote", query), include: { reference: { select: { title: true, body: true } } }, orderBy: [{ starred: "desc" }, { createdAt: "desc" }], take: 8 }),
      prisma.entityNote.findMany({ where: strongTextWhere<Prisma.EntityNoteWhereInput>("bodyMd", query), orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.entityDoc.findMany({ where: { status: "active", ...strongTextWhere<Prisma.EntityDocWhereInput>("title", query) }, orderBy: { updatedAt: "desc" }, take: 8 }),
      prisma.checkIn.findMany({ where: strongTextWhere<Prisma.CheckInWhereInput>("bodyMd", query), orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.journalEntry.findMany({ where: strongTextWhere<Prisma.JournalEntryWhereInput>("bodyMd", query), orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.person.findMany({ where: strongTextWhere<Prisma.PersonWhereInput>("name", query), orderBy: { name: "asc" }, take: 8 }),
      prisma.personFact.findMany({ where: strongTextWhere<Prisma.PersonFactWhereInput>("factValue", query), include: { person: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

    const broadCandidates: SearchCandidate[] = buildCandidates({
      captures,
      tasks,
      projects,
      ideas,
      references,
      referenceSnippets,
      entityNotes,
      entityDocs,
      checkIns,
      journalEntries,
      people,
      personFacts,
    });
    const strongCandidates: SearchCandidate[] = buildCandidates({
      captures: strongCaptures,
      tasks: strongTasks,
      projects: strongProjects,
      ideas: strongIdeas,
      references: strongReferences,
      referenceSnippets: strongReferenceSnippets,
      entityNotes: strongEntityNotes,
      entityDocs: strongEntityDocs,
      checkIns: strongCheckIns,
      journalEntries: strongJournalEntries,
      people: strongPeople,
      personFacts: strongPersonFacts,
    });
    const results = rankSearchResults(
      mergeSearchCandidates(strongCandidates, broadCandidates),
      query,
      40,
    ).map(({ type, id, title, detail, href }) => ({ type, id, title, detail, href }));

    return { ok: true as const, results };
  } catch {
    return { ok: false as const };
  }
}

export type SearchRows = {
  captures: Prisma.CaptureGetPayload<object>[];
  tasks: Prisma.TaskGetPayload<object>[];
  projects: Prisma.ProjectGetPayload<object>[];
  ideas: Prisma.IdeaGetPayload<object>[];
  references: Prisma.ReferenceGetPayload<object>[];
  referenceSnippets: Array<Prisma.ReferenceSnippetGetPayload<{ include: { reference: { select: { title: true; body: true } } } }>>;
  entityNotes: Prisma.EntityNoteGetPayload<object>[];
  entityDocs: Prisma.EntityDocGetPayload<object>[];
  checkIns: Prisma.CheckInGetPayload<object>[];
  journalEntries: Prisma.JournalEntryGetPayload<object>[];
  people: Prisma.PersonGetPayload<object>[];
  personFacts: Array<Prisma.PersonFactGetPayload<{ include: { person: { select: { id: true; name: true } } } }>>;
};

export function buildCandidates(rows: SearchRows): SearchCandidate[] {
  return [
      ...rows.captures.map((capture) => ({
        type: "Capture",
        id: capture.id,
        title: capture.rawText,
        detail: formatShortDate(capture.createdAt),
        href: searchResultHref({ kind: "capture", id: capture.id }),
        primary: capture.rawText,
        secondary: capture.rawText,
        updatedAt: capture.createdAt,
      })),
      ...rows.tasks.map((task) => ({
        type: "Task",
        id: task.id,
        title: task.title,
        detail: task.status,
        href: searchResultHref({ kind: "task", id: task.id }),
        primary: task.title,
        secondary: [task.notes, task.status].filter(Boolean).join(" "),
        updatedAt: task.updatedAt,
      })),
      ...rows.projects.map((project) => ({
        type: "Project",
        id: project.id,
        title: project.name,
        detail: project.status,
        href: searchResultHref({ kind: "project", id: project.id }),
        primary: project.name,
        secondary: [project.currentState, project.nextStep, project.status].filter(Boolean).join(" "),
        updatedAt: project.createdAt,
      })),
      ...rows.ideas.map((idea) => ({
        type: "Idea",
        id: idea.id,
        title: idea.title,
        detail: idea.status,
        href: searchResultHref({ kind: "idea", id: idea.id }),
        primary: idea.title,
        secondary: [idea.body, idea.status].filter(Boolean).join(" "),
        updatedAt: idea.updatedAt,
      })),
      ...rows.references.map((reference) => ({
        ...toReferenceSearchResult(reference),
        primary: reference.title ?? reference.body,
        secondary: [reference.body, reference.url, reference.readStatus].filter(Boolean).join(" "),
        updatedAt: reference.createdAt,
      })),
      ...rows.referenceSnippets.map((snippet) => ({
        type: "Highlight",
        id: snippet.id,
        title: snippet.quote,
        detail: snippet.reference.title ?? snippet.reference.body,
        href: searchResultHref({ kind: "highlight", id: snippet.id, referenceId: snippet.referenceId }),
        primary: snippet.quote,
        secondary: [snippet.quote, snippet.note, snippet.reference.title, snippet.reference.body].filter(Boolean).join(" "),
        updatedAt: snippet.createdAt,
      })),
      ...rows.entityNotes.map((note) => ({
        type: "Note",
        id: note.id,
        title: note.bodyMd,
        detail: formatShortDate(note.createdAt),
        href: searchResultHref({ kind: "note", id: note.id }),
        primary: note.bodyMd,
        secondary: note.bodyMd,
        updatedAt: note.createdAt,
      })),
      ...rows.entityDocs.map((doc) => ({
        type: "Doc",
        id: doc.id,
        title: doc.title,
        detail: formatShortDate(doc.updatedAt),
        href: searchResultHref({
          kind: "doc",
          id: doc.id,
          parentType: doc.parentType === "area" || doc.parentType === "project" || doc.parentType === "journal_entry" ? doc.parentType : null,
          parentId: doc.parentType === "area" || doc.parentType === "project" || doc.parentType === "journal_entry" ? doc.parentId : null,
        }),
        primary: doc.title,
        secondary: doc.bodyMd,
        updatedAt: doc.updatedAt,
      })),
      ...rows.checkIns.map((checkIn) => ({
        type: "Check-in",
        id: checkIn.id,
        title: checkIn.bodyMd,
        detail: formatShortDate(checkIn.createdAt),
        href: searchResultHref({ kind: "check-in", id: checkIn.id }),
        primary: checkIn.bodyMd,
        secondary: checkIn.bodyMd,
        updatedAt: checkIn.createdAt,
      })),
      ...rows.journalEntries.map((entry) => ({
        type: "Journal",
        id: entry.id,
        title: entry.bodyMd,
        detail: formatShortDate(entry.entryDate),
        href: searchResultHref({ kind: "journal", id: entry.id }),
        primary: entry.bodyMd,
        secondary: entry.bodyMd,
        updatedAt: entry.updatedAt,
      })),
      ...rows.people.map((person) => ({
        type: "Person",
        id: person.id,
        title: person.name,
        detail: person.relationshipType ?? person.company ?? undefined,
        href: searchResultHref({ kind: "person", id: person.id }),
        primary: person.name,
        secondary: [person.company, person.relationshipType, person.notesMd].filter(Boolean).join(" "),
        updatedAt: person.createdAt,
      })),
      ...rows.personFacts.map((fact) => ({
        type: "Person fact",
        id: fact.id,
        title: fact.factValue,
        detail: fact.person.name,
        href: searchResultHref({ kind: "person-fact", id: fact.id, personId: fact.person.id }),
        primary: fact.factValue,
        secondary: [fact.factValue, fact.person.name].join(" "),
        updatedAt: fact.createdAt,
      })),
    ];
}
