import type { Reference } from "@prisma/client";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createReferenceFromLookup } from "@/app/actions";
import { SetupNotice } from "@/components/setup-notice";
import { formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  searchReferenceCandidates,
  type ReferenceLookupCandidate,
} from "@/lib/reference-lookup";
import { ReferenceFilters } from "./reference-filters";

export const dynamic = "force-dynamic";

type DatabasePageProps = {
  params: Promise<{ database: string }>;
  searchParams: Promise<{
    status?: string;
    genre?: string;
    rating?: string;
    sort?: string;
    lookup?: string;
  }>;
};

type ReferenceRow = Pick<
  Reference,
  "id" | "title" | "body" | "kind" | "tags" | "metadata" | "createdAt"
>;

export default async function LibraryDatabasePage({
  params,
  searchParams,
}: DatabasePageProps) {
  const { database } = await params;
  const filters = await searchParams;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  if (database === "people") {
    const people = await loadPeople();
    return (
      <DatabaseShell title="People">
        <div className="divide-y divide-[#EEF1EC] rounded-[18px] border border-[#E2E6DF] bg-white">
          {people.map((person) => (
            <Link
              key={person.id}
              href={`/people/${person.id}`}
              className="block px-4 py-3 transition hover:bg-[#F7F9F5]"
            >
              <p className="text-[15px] font-medium text-stone-950">
                {person.name}
              </p>
              <p className="mt-0.5 text-sm text-[#6B7268]">
                {[
                  person.relationshipType,
                  person.company,
                  person.area?.name,
                  `${person._count.facts} facts`,
                  `${person._count.interactions} interactions`,
                ]
                  .filter((item): item is string => Boolean(item))
                  .join(" · ")}
              </p>
            </Link>
          ))}
        </div>
      </DatabaseShell>
    );
  }

  const kind = databaseKind(database);
  if (!kind) {
    notFound();
  }

  const references = await loadReferences(kind);
  const filtered = filterAndSortReferences(references, filters);
  const facet = buildReferenceFacets(references);
  const lookupResult =
    kind === "book" || kind === "movie"
      ? await searchReferenceCandidates(kind, filters.lookup ?? "")
      : null;

  return (
    <DatabaseShell title={databaseTitle(database)}>
      {kind === "book" || kind === "movie" ? (
        <ReferenceLookupResults
          database={database}
          query={filters.lookup ?? ""}
          result={lookupResult}
        />
      ) : null}
      <ReferenceFilters
        database={database}
        filters={filters}
        statuses={facet.statuses}
        genres={facet.genres}
      />
      <div className="divide-y divide-[#EEF1EC] rounded-[18px] border border-[#E2E6DF] bg-white">
        {filtered.map((reference) => (
          <Link
            key={reference.id}
            href={`/references/${reference.id}`}
            className="block px-4 py-3 transition hover:bg-[#F7F9F5]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                {metadataCoverUrl(reference) ? (
                  <Image
                    src={metadataCoverUrl(reference) ?? ""}
                    alt=""
                    width={44}
                    height={64}
                    className="h-16 w-11 shrink-0 rounded-[6px] border border-[#E2E6DF] object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-stone-950">
                    {reference.title ?? reference.body}
                  </p>
                  <p className="mt-0.5 text-sm text-[#6B7268]">
                    {referenceMetaLine(reference)}
                  </p>
                </div>
              </div>
              {metadataRating(reference) ? (
                <span className="shrink-0 rounded-full border border-[#E2E6DF] px-2 py-0.5 text-xs font-medium text-stone-600">
                  {metadataRating(reference)}
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-[#6B7268]">
          No records match these filters.
        </p>
      ) : null}
    </DatabaseShell>
  );
}

function DatabaseShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-3">
        <Link
          href="/ideas"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          Library
        </Link>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          {title}
        </h1>
      </header>
      {children}
    </div>
  );
}

function ReferenceLookupResults({
  database,
  query,
  result,
}: {
  database: string;
  query: string;
  result: Awaited<ReturnType<typeof searchReferenceCandidates>> | null;
}) {
  return (
    <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-3">
      <form className="flex gap-2">
        <input
          name="lookup"
          defaultValue={query}
          placeholder={database === "books" ? "Find a book" : "Find a movie"}
          className="h-10 min-w-0 flex-1 rounded-full border border-[#E2E6DF] bg-white px-4 text-sm outline-none focus:border-teal-700"
        />
        <button
          className="h-10 rounded-full bg-teal-700 px-4 text-sm font-medium text-white"
          formAction={`/ideas/${database}`}
        >
          Search
        </button>
      </form>
      {result && !result.ok ? (
        <p className="mt-3 text-sm text-[#6B7268]">{result.reason}</p>
      ) : null}
      {result?.ok && result.candidates.length > 0 ? (
        <div className="mt-3 divide-y divide-[#EEF1EC]">
          {result.candidates.map((candidate) => (
            <ReferenceLookupCandidateRow
              key={`${candidate.source}:${candidate.sourceId}`}
              candidate={candidate}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ReferenceLookupCandidateRow({
  candidate,
}: {
  candidate: ReferenceLookupCandidate;
}) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 gap-3">
        {candidateCoverUrl(candidate) ? (
          <Image
            src={candidateCoverUrl(candidate) ?? ""}
            alt=""
            width={44}
            height={64}
            className="h-16 w-11 shrink-0 rounded-[6px] border border-[#E2E6DF] object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-950">
            {candidate.title}
          </p>
          <p className="mt-0.5 text-sm text-[#6B7268]">
            {candidate.subtitle ?? candidate.body}
          </p>
          <p className="mt-0.5 text-xs text-[#B0ACA2]">
            Source: {candidateSourceLabel(candidate.source)}
          </p>
        </div>
      </div>
      <form action={createReferenceFromLookup}>
        <input type="hidden" name="kind" value={candidate.kind} />
        <input type="hidden" name="source" value={candidate.source} />
        <input type="hidden" name="sourceId" value={candidate.sourceId} />
        <input type="hidden" name="title" value={candidate.title} />
        <input type="hidden" name="body" value={candidate.body} />
        <input type="hidden" name="url" value={candidate.url ?? ""} />
        <input
          type="hidden"
          name="tagsJson"
          value={JSON.stringify(candidate.tags)}
        />
        <input
          type="hidden"
          name="metadataJson"
          value={JSON.stringify(candidate.metadata)}
        />
        <button className="h-9 rounded-full border border-teal-700/40 bg-white px-3 text-sm font-medium text-teal-800 transition hover:border-teal-700">
          Add
        </button>
      </form>
    </div>
  );
}

function candidateCoverUrl(candidate: ReferenceLookupCandidate) {
  return stringValue(candidate.metadata.coverUrl);
}

function candidateSourceLabel(source: ReferenceLookupCandidate["source"]) {
  if (source === "open_library") return "Open Library";
  if (source === "booklore") return "BookLore";
  return "TMDB";
}

async function loadPeople() {
  return prisma.person.findMany({
    where: { status: "active" },
    include: {
      area: true,
      _count: { select: { facts: true, interactions: true } },
    },
    orderBy: { name: "asc" },
  });
}

async function loadReferences(kind: string) {
  return prisma.reference.findMany({
    where: { kind },
    orderBy: [{ title: "asc" }, { createdAt: "desc" }],
    take: 1000,
  });
}

function filterAndSortReferences(
  references: ReferenceRow[],
  filters: { status?: string; genre?: string; rating?: string; sort?: string },
) {
  const minRating = filters.rating ? Number(filters.rating) : null;
  return references
    .filter((reference) => {
      const metadata = metadataRecord(reference);
      if (filters.status && metadataStatus(metadata) !== filters.status) {
        return false;
      }
      if (filters.genre && !metadataGenres(metadata).includes(filters.genre)) {
        return false;
      }
      if (
        minRating !== null &&
        (metadataRating(reference) === null ||
          Number(metadataRating(reference)) < minRating)
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      if (filters.sort === "rating") {
        return (
          Number(metadataRating(right) ?? 0) - Number(metadataRating(left) ?? 0)
        );
      }
      if (filters.sort === "newest") {
        return right.createdAt.getTime() - left.createdAt.getTime();
      }
      return (left.title ?? left.body).localeCompare(right.title ?? right.body);
    });
}

function buildReferenceFacets(references: ReferenceRow[]) {
  const statuses = new Set<string>();
  const genres = new Set<string>();
  for (const reference of references) {
    const metadata = metadataRecord(reference);
    const status = metadataStatus(metadata);
    if (status) statuses.add(status);
    for (const genre of metadataGenres(metadata)) genres.add(genre);
  }
  return {
    statuses: [...statuses].sort((a, b) => a.localeCompare(b)),
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
  };
}

function databaseKind(database: string) {
  if (database === "books") return "book";
  if (database === "movies") return "movie";
  if (database === "references") return "reference";
  return null;
}

function databaseTitle(database: string) {
  if (database === "books") return "Books";
  if (database === "movies") return "Movies";
  return "References";
}

function referenceMetaLine(reference: ReferenceRow) {
  const metadata = metadataRecord(reference);
  if (reference.kind === "book") {
    return [
      stringValue(metadata.author),
      metadataStatus(metadata),
      metadataGenres(metadata).join(", "),
      metadata.pages ? `${metadata.pages} pages` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (reference.kind === "movie") {
    return [
      stringValue(metadata.year),
      stringValue(metadata.director),
      metadataStatus(metadata),
      metadataGenres(metadata).join(", "),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return reference.tags.join(" · ") || formatShortDate(reference.createdAt);
}

function metadataRecord(reference: ReferenceRow) {
  return typeof reference.metadata === "object" &&
    reference.metadata !== null &&
    !Array.isArray(reference.metadata)
    ? (reference.metadata as Record<string, unknown>)
    : {};
}

function metadataStatus(metadata: Record<string, unknown>) {
  return stringValue(metadata.status);
}

function metadataGenres(metadata: Record<string, unknown>) {
  const genre = metadata.genre;
  if (Array.isArray(genre)) {
    return genre
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof genre === "string" && genre.trim()) {
    return genre
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function metadataRating(reference: ReferenceRow) {
  const rating = metadataRecord(reference).rating;
  return typeof rating === "number" || typeof rating === "string"
    ? `${rating}`
    : null;
}

function metadataCoverUrl(reference: ReferenceRow) {
  return stringValue(metadataRecord(reference).coverUrl);
}

function stringValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return null;
}
