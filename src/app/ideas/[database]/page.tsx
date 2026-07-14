import type { Reference } from "@prisma/client";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { createReferenceFromLookup } from "@/app/actions";
import { ReadLaterForm, type ReadLaterProjectOption } from "@/components/read-later-form";
import { ReadLaterList } from "@/components/read-later-list";
import { SetupNotice } from "@/components/setup-notice";
import { formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import type { ReadLaterStatus } from "@/lib/read-later";
import {
  buildReadLaterAreaContext,
  readLaterFilingPath,
} from "@/lib/read-later-display";
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

  if (database === "read-later") {
    const result = await loadReadLater(filters.status);
    if (!result.ok) {
      return <SetupNotice reason="Read Later is not migrated or reachable." />;
    }
    return (
      <DatabaseShell title="Read Later">
        <ReadLaterForm
          areas={result.areas}
          selectableAreaIds={result.activeAreaIds}
          projects={result.projects}
        />
        <nav aria-label="Read Later status" className="flex flex-wrap gap-1.5">
          {([
            ["unread", "Unread"],
            ["read", "Read"],
            ["archived", "Archived"],
          ] as const).map(([value, label]) => (
            <Link
              key={value}
              href={value === "unread" ? "/ideas/read-later" : `/ideas/read-later?status=${value}`}
              aria-current={result.status === value ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                result.status === value
                  ? "border-teal-700/30 bg-[#E8F5F0] text-teal-900"
                  : "border-[#DCE2DA] bg-white text-stone-600 hover:border-teal-700/40 hover:text-teal-800"
              }`}
            >
              {label} <span className="ml-1.5 text-[11px] text-[#879087]">{result.counts[value]}</span>
            </Link>
          ))}
        </nav>
        <ReadLaterList
          items={result.items}
          status={result.status}
          areaOptions={result.areaOptions}
          projects={result.projects}
        />
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
    <DatabaseShell
      title={databaseTitle(database)}
      action={
        kind === "book" || kind === "movie" ? (
          <ReferenceLookupResults
            database={database}
            query={filters.lookup ?? ""}
            result={lookupResult}
          />
        ) : null
      }
    >
      {references.length > 0 ? (
        <ReferenceFilters
          database={database}
          filters={filters}
          statuses={facet.statuses}
          genres={facet.genres}
          statusCounts={facet.statusCounts}
          totalCount={facet.total}
        />
      ) : null}
      {filtered.length > 0 ? (
        <ReferenceList kind={kind} references={filtered} />
      ) : null}
      {filtered.length === 0 ? (
        <p className="text-sm text-[#6B7268]">
          No records match these filters.
        </p>
      ) : null}
    </DatabaseShell>
  );
}

async function loadReadLater(requestedStatus?: string) {
  const status: ReadLaterStatus =
    requestedStatus === "read"
      ? "read"
      : requestedStatus === "archived"
        ? "archived"
        : "unread";
  try {
    const [references, groupedCounts, areas, rawProjects] = await Promise.all([
      prisma.reference.findMany({
        where: { kind: "read_later", readStatus: status },
        include: { area: true, project: true },
        orderBy: { savedAt: "desc" },
        take: 500,
      }),
      prisma.reference.groupBy({
        by: ["readStatus"],
        where: { kind: "read_later" },
        _count: { _all: true },
      }),
      prisma.area.findMany({
        where: { isSystem: false },
        select: {
          id: true,
          name: true,
          parentAreaId: true,
          sortOrder: true,
          status: true,
          isSystem: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.project.findMany({
        where: { status: { in: ["active", "parked", "someday"] } },
        select: { id: true, name: true, areaId: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const areaContext = buildReadLaterAreaContext(areas);
    const projects: ReadLaterProjectOption[] = rawProjects.map((project) => ({
      id: project.id,
      name: project.name,
      areaPath: project.areaId ? areaContext.pathById.get(project.areaId) ?? "Area" : null,
    }));
    const counts: Record<ReadLaterStatus, number> = { unread: 0, read: 0, archived: 0 };
    for (const group of groupedCounts) {
      if (group.readStatus === "unread" || group.readStatus === "read" || group.readStatus === "archived") {
        counts[group.readStatus] = group._count._all;
      }
    }
    return {
      ok: true as const,
      status,
      counts,
      areas,
      activeAreaIds: areaContext.activeAreaIds,
      areaOptions: areaContext.activeOptions,
      projects,
      items: references.map((reference) => ({
        id: reference.id,
        title: reference.title,
        body: reference.body,
        url: reference.url,
        readStatus: reference.readStatus,
        savedAt: reference.savedAt,
        areaId: reference.areaId,
        projectId: reference.projectId,
        filingPath: readLaterFilingPath(
          {
            areaId: reference.areaId,
            project: reference.project
              ? { name: reference.project.name, areaId: reference.project.areaId }
              : null,
          },
          areaContext.pathById,
        ),
      })),
    };
  } catch {
    return { ok: false as const };
  }
}

function DatabaseShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
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
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
            {title}
          </h1>
          {action}
        </div>
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
    <details className="group" open={Boolean(query)}>
      <summary className="inline-flex h-[34px] cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
        <Plus size={13} />
        {database === "books" ? "Add a book" : "Add a movie"}
      </summary>
      <section className="mt-2.5 rounded-[14px] border border-[#E2E6DF] bg-white p-3">
        <form className="flex gap-2">
          <input
            name="lookup"
            defaultValue={query}
            placeholder={database === "books" ? "Find a book" : "Find a movie"}
            className="h-10 min-w-0 flex-1 rounded-full border border-[#E2E6DF] bg-white px-4 text-sm outline-none focus:border-teal-700"
          />
          <button
            className="h-10 rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
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
    </details>
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
            {candidateSourceLabel(candidate.source)}
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
  const statusCounts: Record<string, number> = {};
  for (const reference of references) {
    const metadata = metadataRecord(reference);
    const status = metadataStatus(metadata);
    if (status) {
      statuses.add(status);
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }
    for (const genre of metadataGenres(metadata)) genres.add(genre);
  }
  return {
    statuses: [...statuses].sort((a, b) => a.localeCompare(b)),
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    statusCounts,
    total: references.length,
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

function ReferenceList({
  kind,
  references,
}: {
  kind: string;
  references: ReferenceRow[];
}) {
  if (kind === "movie") {
    return (
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
        {references.map((reference) => (
          <Link
            key={reference.id}
            href={`/references/${reference.id}`}
            className="group"
          >
            {metadataCoverUrl(reference) ? (
              <Image
                src={metadataCoverUrl(reference) ?? ""}
                alt=""
                width={140}
                height={210}
                className="aspect-[2/3] w-full rounded-[8px] border border-[#E2E6DF] object-cover shadow-[0_3px_8px_rgba(28,25,23,0.15)] transition group-hover:border-teal-700/50"
              />
            ) : (
              <span className="grid aspect-[2/3] w-full place-items-center rounded-[8px] border border-dashed border-[#D3D9D1] font-serif text-sm text-[#B0ACA2]">
                {(reference.title ?? reference.body).charAt(0)}
              </span>
            )}
            <span className="mt-1.5 block truncate text-[12.5px] font-medium leading-[1.3] text-stone-950">
              {reference.title ?? reference.body}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-[#9AA096]">
              {[
                stringValue(metadataRecord(reference).year),
                metadataRating(reference)
                  ? `${metadataRating(reference)}/${metadataRatingScale(reference)}`
                  : metadataStatus(metadataRecord(reference))
                    ? statusLabel(metadataStatus(metadataRecord(reference)) ?? "")
                    : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Link>
        ))}
      </div>
    );
  }

  if (kind !== "book") {
    return (
      <div className="divide-y divide-[#EEF1EC] rounded-[18px] border border-[#E2E6DF] bg-white">
        {references.map((reference) => (
          <Link
            key={reference.id}
            href={`/references/${reference.id}`}
            className="block px-4 py-3 transition hover:bg-[#F7F9F5]"
          >
            <p className="text-[15px] font-medium text-stone-950">
              {reference.title ?? reference.body}
            </p>
            <p className="mt-0.5 text-sm text-[#6B7268]">
              {referenceMetaLine(reference)}
            </p>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#EEF1EC] rounded-[18px] border border-[#E2E6DF] bg-white">
      {references.map((reference) => (
        <Link
          key={reference.id}
          href={`/references/${reference.id}`}
          className="flex items-center gap-3.5 px-4 py-3 transition hover:bg-[#F7F9F5]"
        >
          {metadataCoverUrl(reference) ? (
            <Image
              src={metadataCoverUrl(reference) ?? ""}
              alt=""
              width={46}
              height={68}
              className="h-[68px] w-[46px] shrink-0 rounded-[6px] border border-[#E2E6DF] object-cover shadow-[0_2px_5px_rgba(28,25,23,0.12)]"
            />
          ) : (
            <span className="grid h-[68px] w-[46px] shrink-0 place-items-center rounded-[6px] border border-dashed border-[#D3D9D1] font-serif text-[13px] text-[#B0ACA2]">
              {(reference.title ?? reference.body).charAt(0)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-stone-950">
              {reference.title ?? reference.body}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-stone-500">
              {referenceByline(reference)}
            </span>
            <span className="mt-1.5 flex items-center gap-2">
              {metadataStatus(metadataRecord(reference)) ? (
                <span className="inline-flex h-[22px] items-center rounded-full border border-[#E2E6DF] px-2.5 text-[11px] font-medium text-stone-600">
                  {statusLabel(metadataStatus(metadataRecord(reference)) ?? "")}
                </span>
              ) : null}
              <span className="truncate text-xs text-[#9AA096]">
                {metadataGenres(metadataRecord(reference)).join(" · ")}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-[13px] tabular-nums text-stone-600">
            {metadataRating(reference) ? (
              <>
                {metadataRating(reference)}
                <span className="text-[#B0ACA2]">/10</span>
              </>
            ) : (
              <span className="text-[#D3D9D1]">—</span>
            )}
          </span>
        </Link>
      ))}
    </div>
  );
}

function referenceByline(reference: ReferenceRow) {
  const metadata = metadataRecord(reference);
  if (reference.kind === "book") {
    return [
      stringValue(metadata.author),
      metadata.pages ? `${metadata.pages} pages` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return [stringValue(metadata.year), stringValue(metadata.director)]
    .filter(Boolean)
    .join(" · ");
}

function statusLabel(status: string) {
  const cleaned = status.replace(/-/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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
  const record = metadataRecord(reference);
  return stringValue(record.coverUrl) ?? stringValue(record.cover);
}

function metadataRatingScale(reference: ReferenceRow) {
  if (reference.kind === "book") return 10;
  const rating = Number(metadataRating(reference));
  if (reference.kind === "movie") return Number.isFinite(rating) && rating > 5 ? 10 : 5;
  return Number.isFinite(rating) && rating > 5 ? 10 : 5;
}

function stringValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return null;
}
