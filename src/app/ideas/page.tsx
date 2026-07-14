import type { Document, JournalEntry, Person, Reference } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { JournalEntryEditor } from "@/components/journal-entry-editor";
import { MarkdownPreview } from "@/components/markdown-preview";
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

  const { ideas, journalEntries, people, books, movies, references, readLater } = result;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          Library
        </h1>
      </header>
      <ReferenceDatabaseOverview
        people={people}
        books={books}
        movies={movies}
        references={references}
        readLater={readLater}
      />
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        <JournalSection entries={journalEntries} />
        <div className="space-y-8">
          <PeopleSection people={people} />
          <ReferenceSection id="books" title="Books" references={books} />
          <ReferenceSection id="movies" title="Movies" references={movies} />
          <IdeasSection ideas={ideas} />
          <ReferenceSection
            id="references"
            title="References"
            references={references}
          />
        </div>
      </div>
    </div>
  );
}

type PeopleListItem = Person & {
  _count: { facts: number; interactions: number };
};

function ReferenceDatabaseOverview({
  people,
  books,
  movies,
  references,
  readLater,
}: {
  people: PeopleListItem[];
  books: LibraryReference[];
  movies: LibraryReference[];
  references: LibraryReference[];
  readLater: LibraryReference[];
}) {
  const databases = [
    {
      href: "/ideas/read-later",
      label: "Read Later",
      count: readLater.length,
      detail: latestReferenceLine(readLater[0]) ?? "No unread links waiting.",
    },
    {
      href: "/ideas/people",
      label: "People",
      count: people.length,
      detail: people[0]
        ? [
            people[0].name,
            people[0]._count.facts > 0
              ? `${people[0]._count.facts} fact${people[0]._count.facts === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : "No people saved yet.",
    },
    {
      href: "/ideas/books",
      label: "Books",
      count: books.length,
      detail: latestReferenceLine(books[0]) ?? "No books saved yet.",
    },
    {
      href: "/ideas/movies",
      label: "Movies",
      count: movies.length,
      detail: latestReferenceLine(movies[0]) ?? "No movies saved yet.",
    },
    {
      href: "/ideas/references",
      label: "References",
      count: references.length,
      detail: latestReferenceLine(references[0]) ?? "No references saved yet.",
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Reference databases
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {databases.map((database) => (
          <Link
            key={database.label}
            href={database.href}
            className="rounded-[18px] border border-[#E2E6DF] bg-white px-4 py-3.5 transition hover:border-teal-700/50"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium text-stone-950">
                {database.label}
              </h3>
              <p className="text-sm text-[#9AA096]">{database.count}</p>
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#6B7268]">
              {database.detail}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

type IdeaListItem =
  Awaited<ReturnType<typeof loadIdeas>> extends infer Result
    ? Result extends { ok: true; ideas: Array<infer Idea> }
      ? Idea
      : never
    : never;

function IdeasSection({ ideas }: { ideas: IdeaListItem[] }) {
  const visibleIdeas = ideas.slice(0, 6);
  const olderIdeas = ideas.slice(6);

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Ideas
        </h2>
        {olderIdeas.length > 0 ? (
          <span className="text-xs text-[#9AA096]">
            {olderIdeas.length} more
          </span>
        ) : null}
      </div>
      {ideas.length === 0 ? (
        <p className="text-sm text-[#6B7268]">No active ideas.</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {visibleIdeas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
          {olderIdeas.length > 0 ? (
            <details className="rounded-[14px] border border-[#E2E6DF] bg-white/75">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-stone-700 transition hover:text-teal-700 [&::-webkit-details-marker]:hidden">
                <span>Older active ideas</span>
                <span className="text-xs font-normal text-[#9AA096]">
                  {olderIdeas.length}
                </span>
              </summary>
              <div className="space-y-2.5 border-t border-[#EEF1EC] p-2.5">
                {olderIdeas.map((idea) => (
                  <IdeaCard key={idea.id} idea={idea} compact />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function IdeaCard({
  idea,
  compact = false,
}: {
  idea: IdeaListItem;
  compact?: boolean;
}) {
  return (
    <details
      className={`rounded-[14px] border border-[#E2E6DF] bg-white ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              {idea.project?.area?.name ?? idea.area?.name ?? "Inbox"}
              {" / "}
              {idea.project?.name ?? idea.area?.name ?? idea.status}
            </p>
            <h2
              className={`mt-1 font-medium leading-snug text-stone-950 ${
                compact ? "text-[15px]" : "text-[16px]"
              }`}
            >
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
  );
}

function PeopleSection({ people }: { people: PeopleListItem[] }) {
  if (people.length === 0) {
    return null;
  }

  return (
    <section id="people" className="scroll-mt-24 space-y-2.5">
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

type LibraryReference = Pick<
  Reference,
  "id" | "title" | "body" | "url" | "tags" | "metadata" | "kind" | "createdAt"
>;

function ReferenceSection({
  id,
  title,
  references,
}: {
  id: string;
  title: string;
  references: LibraryReference[];
}) {
  if (references.length === 0) {
    return null;
  }

  return (
    <section id={id} className="scroll-mt-24 space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        {title} {references.length}
      </h2>
      <div className="space-y-2.5">
        {references.map((reference) => (
          <details
            key={reference.id}
            id={`reference-${reference.id}`}
            className="rounded-[14px] border border-[#E2E6DF] bg-white p-4"
          >
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-start gap-3">
                <ReferenceCover reference={reference} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium leading-snug text-stone-950">
                        {reference.title ?? reference.body}
                      </h3>
                      <p className="mt-1 text-xs text-[#9AA096]">
                        {referenceMetaLine(reference)}
                      </p>
                    </div>
                    {referenceRating(reference) ? (
                      <span className="shrink-0 rounded-full border border-[#E2E6DF] px-2 py-0.5 text-xs font-medium text-stone-600">
                        {referenceRating(reference)}
                      </span>
                    ) : null}
                  </div>
                  {reference.body ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-600">
                      {reference.body}
                    </p>
                  ) : null}
                </div>
              </div>
            </summary>
            <div className="mt-3 space-y-2 border-t border-[#EEF1EC] pt-3">
              <MarkdownPreview body={reference.body} />
              {reference.url ? (
                <a
                  href={reference.url}
                  className="inline-flex text-sm font-medium text-teal-700 transition hover:text-teal-900"
                >
                  Open source
                </a>
              ) : null}
              <Link
                href={`/references/${reference.id}`}
                className="inline-flex text-sm font-medium text-teal-700 transition hover:text-teal-900"
              >
                Open detail
              </Link>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

type JournalEntryWithAttachments = JournalEntry & {
  attachments: Document[];
};

function JournalSection({ entries }: { entries: JournalEntryWithAttachments[] }) {
  const groups = new Map<string, JournalEntryWithAttachments[]>();
  for (const entry of entries) {
    const key = entry.entryDate.toISOString().slice(0, 10);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Journal
        </h2>
        {entries.length > 0 ? (
          <a
            href="/api/journal/export"
            className="inline-flex h-8 items-center justify-center rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
          >
            Download .md
          </a>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-[#6B7268]">No journal entries yet.</p>
      ) : (
        <div className="max-w-2xl space-y-5">
          {Array.from(groups.entries()).map(([date, dateEntries], index) => (
            <div key={date}>
              {index > 0 ? (
                <div className="h-px bg-[#DDE2DA]" />
              ) : null}
              <h3 className="font-serif text-[15px] italic text-stone-500">
                {formatDateOnly(date)}
              </h3>
              <div className="mt-3 space-y-3">
                {dateEntries.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-[18px] border border-[#E2E6DF] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]"
                  >
                    <MarkdownPreview
                      body={entry.bodyMd}
                      className="font-serif text-[18px] leading-[1.65] text-stone-800"
                    />
                    {entry.attachments.filter(isJournalImage).length > 0 ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {entry.attachments.filter(isJournalImage).map((attachment) => (
                          <a
                            key={attachment.id}
                            href={`/api/documents/${attachment.id}/download`}
                            className="group relative aspect-[4/3] overflow-hidden rounded-[14px] border border-[#E2E6DF] bg-[#F7F9F5]"
                          >
                            <Image
                              src={`/api/documents/${attachment.id}/download`}
                              alt={attachment.filename}
                              fill
                              sizes="(min-width: 640px) 180px, 45vw"
                              unoptimized
                              className="object-cover transition duration-200 group-hover:scale-[1.02]"
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#B0ACA2]">
                      <span>{entry.source}</span>
                      {entry.tags.length > 0 ? (
                        <span>{entry.tags.join(" · ")}</span>
                      ) : null}
                      {entry.updatedAt.getTime() !==
                      entry.createdAt.getTime() ? (
                        <span>edited {formatShortDate(entry.updatedAt)}</span>
                      ) : null}
                    </div>
                    <JournalEntryEditor
                      entryId={entry.id}
                      entryDate={dateInputValue(entry.entryDate)}
                      bodyMd={entry.bodyMd}
                      tagsText={entry.tags.join(", ")}
                    />
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

function dateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function ReferenceCover({ reference }: { reference: LibraryReference }) {
  const coverUrl = referenceCoverUrl(reference);
  const label =
    reference.kind === "movie"
      ? "Poster"
      : reference.kind === "book"
        ? "Cover"
        : "Reference";

  return (
    <div className="relative h-[74px] w-[50px] shrink-0 overflow-hidden rounded-[8px] border border-[#E2E6DF] bg-[#F7F9F5]">
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={label}
          fill
          sizes="50px"
          className="object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center px-1 text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-[#B0B7AD]">
          {label}
        </div>
      )}
    </div>
  );
}

async function loadIdeas() {
  try {
    const [ideas, rawJournalEntries, people, books, movies, references, readLater] =
      await Promise.all([
        prisma.idea.findMany({
          where: { status: { in: ["seed", "developing"] } },
          include: {
            area: true,
            project: { include: { area: true } },
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
        prisma.reference.findMany({
          where: { kind: "book" },
          orderBy: [{ title: "asc" }, { createdAt: "desc" }],
          take: 500,
        }),
        prisma.reference.findMany({
          where: { kind: "movie" },
          orderBy: [{ title: "asc" }, { createdAt: "desc" }],
          take: 500,
        }),
        prisma.reference.findMany({
          where: { kind: "reference" },
          orderBy: [{ createdAt: "desc" }],
          take: 12,
        }),
        prisma.reference.findMany({
          where: { kind: "read_later", readStatus: "unread" },
          orderBy: { savedAt: "desc" },
          take: 500,
        }),
      ]);
    const journalAttachments =
      rawJournalEntries.length > 0
        ? await prisma.document.findMany({
            where: {
              parentType: "journal_entry",
              parentId: { in: rawJournalEntries.map((entry) => entry.id) },
            },
            orderBy: { createdAt: "asc" },
          })
        : [];
    const attachmentsByEntry = new Map<string, Document[]>();
    for (const attachment of journalAttachments) {
      if (!attachment.parentId) continue;
      const group = attachmentsByEntry.get(attachment.parentId) ?? [];
      group.push(attachment);
      attachmentsByEntry.set(attachment.parentId, group);
    }
    const journalEntries = rawJournalEntries.map((entry) => ({
      ...entry,
      attachments: attachmentsByEntry.get(entry.id) ?? [],
    }));

    return {
      ok: true as const,
      ideas,
      journalEntries,
      people,
      books,
      movies,
      references,
      readLater,
    };
  } catch {
    return {
      ok: false as const,
      ideas: [],
      journalEntries: [],
      people: [],
      books: [],
      movies: [],
      references: [],
      readLater: [],
    };
  }
}

function isJournalImage(attachment: Document) {
  return attachment.mime.startsWith("image/");
}

function referenceMetaLine(reference: LibraryReference) {
  const metadata = getMetadata(reference);
  if (reference.kind === "book") {
    return [
      stringValue(metadata.author),
      stringValue(metadata.status),
      stringValue(metadata.genre),
      metadata.pages ? `${metadata.pages} pages` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (reference.kind === "movie") {
    return [
      stringValue(metadata.year),
      stringValue(metadata.director),
      stringValue(metadata.status),
      stringValue(metadata.genre),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return reference.tags.join(" · ") || formatShortDate(reference.createdAt);
}

function latestReferenceLine(reference: LibraryReference | undefined) {
  if (!reference) {
    return null;
  }

  return [reference.title ?? reference.body, referenceMetaLine(reference)]
    .filter(Boolean)
    .join(" · ");
}

function referenceRating(reference: LibraryReference) {
  const rating = getMetadata(reference).rating;
  return typeof rating === "number" || typeof rating === "string"
    ? `${rating}`
    : null;
}

function referenceCoverUrl(reference: LibraryReference) {
  const metadata = getMetadata(reference);
  return stringValue(metadata.coverUrl) ?? stringValue(metadata.cover);
}

function getMetadata(reference: LibraryReference) {
  return typeof reference.metadata === "object" &&
    reference.metadata !== null &&
    !Array.isArray(reference.metadata)
    ? (reference.metadata as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return null;
}
