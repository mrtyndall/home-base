import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, RefreshCw, Star } from "lucide-react";
import {
  setReferenceSnippetStarred,
  syncBookLoreSnippetsAction,
} from "@/app/actions";
import { MarkdownPreview } from "@/components/markdown-preview";
import { ReferenceRating } from "@/components/reference-rating";
import { SetupNotice } from "@/components/setup-notice";
import { formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadReferenceMentions } from "@/lib/reference-mentions";

export const dynamic = "force-dynamic";

type ReferenceDetailPageProps = {
  params: Promise<{ referenceId: string }>;
};

export default async function ReferenceDetailPage({
  params,
}: ReferenceDetailPageProps) {
  const { referenceId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadReference(referenceId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.reference) {
    notFound();
  }

  const { reference, mentions } = result;
  const backHref =
    reference.kind === "book"
      ? "/ideas/books"
      : reference.kind === "movie"
        ? "/ideas/movies"
        : "/ideas/references";

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          {reference.kind === "book"
            ? "Books"
            : reference.kind === "movie"
              ? "Movies"
              : "References"}
        </Link>
        <div className="flex gap-4">
          {metadataCoverUrl(reference) ? (
            <Image
              src={metadataCoverUrl(reference) ?? ""}
              alt=""
              width={96}
              height={144}
              className="h-36 w-24 shrink-0 rounded-[8px] border border-[#E2E6DF] object-cover shadow-[0_4px_12px_rgba(28,25,23,0.18)]"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="font-serif text-[25px] font-medium leading-[1.15] tracking-[-0.01em] text-stone-950">
              {reference.title ?? reference.body}
            </h1>
            {metadataCreator(reference) || metadataYear(reference) ? (
              <p className="mt-1 text-sm text-stone-600">
                {[metadataCreator(reference), metadataYear(reference)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-[#9AA096]">
              {kindLabel(reference.kind)}
              {watchStatus(reference) ? ` · ${watchStatus(reference)}` : ""} · added{" "}
              {formatShortDate(reference.createdAt)}
            </p>
            {metadataRating(reference) ? (
              <p className="mt-2 text-xs text-[#9AA096]">
                {metadataRatingLabel(reference)}
              </p>
            ) : null}
            <ReferenceRating
              referenceId={reference.id}
              rating={personalRating(reference)}
              scale={manualRatingScale(reference)}
            />
            {metadataGenres(reference) ? (
              <p className="mt-2.5 text-[13px] leading-normal text-stone-600">
                {metadataGenres(reference)}
              </p>
            ) : null}
            {sourceUrl(reference) ? (
              <a
                href={sourceUrl(reference) ?? ""}
                className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-teal-700 transition hover:text-teal-900"
              >
                {sourceHost(sourceUrl(reference) ?? "")}
                <ArrowUpRight size={11} strokeWidth={2.5} />
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {reference.body?.trim() ? (
        <section className="max-w-xl space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            {reference.kind === "book"
              ? "Publisher's description"
              : reference.kind === "movie"
                ? "Synopsis"
                : "Notes"}
          </h2>
          <details className="group">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="max-h-40 overflow-hidden text-sm leading-[1.65] text-stone-700 group-open:max-h-none group-open:overflow-visible">
                <MarkdownPreview body={reference.body} mentions={mentions} />
              </div>
              <span className="mt-1 inline-block text-[13px] font-medium text-stone-500 transition hover:text-stone-950 group-open:hidden">
                Read more
              </span>
            </summary>
          </details>
        </section>
      ) : null}

      {metadataCast(reference) ? (
        <section className="max-w-xl space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Cast
          </h2>
          <p className="text-sm leading-relaxed text-stone-700">
            {metadataCast(reference)}
          </p>
        </section>
      ) : null}

      {hasBookLoreSource(reference) || reference.snippets.length > 0 ? (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Highlights & notes{" "}
              {reference.snippets.length > 0 ? (
                <span className="font-medium text-[#B0ACA2]">
                  {reference.snippets.length}
                </span>
              ) : null}
            </h2>
            {hasBookLoreSource(reference) ? (
              <form action={syncBookLoreSnippetsAction}>
                <input type="hidden" name="referenceId" value={reference.id} />
                <button
                  type="submit"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
                >
                  <RefreshCw size={13} />
                  Sync BookLore
                </button>
              </form>
            ) : null}
          </div>
          {reference.snippets.length > 0 ? (
            <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
              {reference.snippets.map((snippet) => (
                <article
                  key={snippet.id}
                  id={`snippet-${snippet.id}`}
                  className="scroll-mt-24 px-4 py-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <blockquote className="font-serif text-[16px] italic leading-[1.55] text-stone-800">
                        &ldquo;{snippet.quote}&rdquo;
                      </blockquote>
                      <p className="text-[11px] text-[#B0ACA2]">
                        {snippet.kind === "note" ? "Note" : "Highlight"}
                        {snippet.location ? ` · ${snippet.location}` : ""}
                      </p>
                      {snippet.note ? (
                        <p className="text-[13px] leading-[1.55] text-stone-600">
                          {snippet.note}
                        </p>
                      ) : null}
                    </div>
                    <form action={setReferenceSnippetStarred}>
                      <input type="hidden" name="snippetId" value={snippet.id} />
                      <input
                        type="hidden"
                        name="starred"
                        value={snippet.starred ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        aria-label={
                          snippet.starred
                            ? "Unstar highlight"
                            : "Star highlight"
                        }
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#E2E6DF] bg-white text-stone-500 transition hover:border-teal-700/50 hover:text-teal-700"
                      >
                        <Star
                          size={15}
                          fill={snippet.starred ? "currentColor" : "none"}
                          className={
                            snippet.starred ? "text-teal-700" : undefined
                          }
                        />
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6B7268]">
              No BookLore highlights synced.
            </p>
          )}
        </section>
      ) : null}

      {Object.keys(extraMetadata(reference)).length > 0 ? (
        <details>
          <summary className="inline-flex h-8 cursor-pointer list-none items-center px-1 text-[13px] font-medium text-stone-500 transition hover:text-stone-950 [&::-webkit-details-marker]:hidden">
            All metadata
          </summary>
          <dl className="mt-2 max-w-xl divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white px-4">
            {Object.entries(extraMetadata(reference)).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[110px_1fr] gap-3 py-2">
                <dt className="text-xs text-[#9AA096]">{key}</dt>
                <dd className="break-words text-sm text-stone-800">
                  {displayValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}

async function loadReference(referenceId: string) {
  try {
    const reference = await prisma.reference.findUnique({
      where: { id: referenceId },
      include: {
        snippets: {
          orderBy: [
            { starred: "desc" },
            { sourceCreatedAt: "desc" },
            { createdAt: "desc" },
          ],
        },
      },
    });
    if (!reference) {
      return { ok: true as const, reference: null, mentions: [] };
    }

    const mentionMap = await loadReferenceMentions("reference", [reference.id]);
    return {
      ok: true as const,
      reference,
      mentions: mentionMap.get(reference.id) ?? [],
    };
  } catch {
    return { ok: false as const };
  }
}

function metadataRecord(reference: { metadata: unknown }) {
  return typeof reference.metadata === "object" &&
    reference.metadata !== null &&
    !Array.isArray(reference.metadata)
    ? (reference.metadata as Record<string, unknown>)
    : {};
}

function metadataCoverUrl(reference: { metadata: unknown }) {
  const record = metadataRecord(reference);
  const coverUrl = record.coverUrl ?? record.cover;
  return typeof coverUrl === "string" && coverUrl.trim() ? coverUrl : null;
}

const HERO_METADATA_KEYS = [
  "author",
  "authors",
  "categories",
  "director",
  "cast",
  "year",
  "genre",
  "genres",
  "cover",
  "coverUrl",
  "url",
  "myRating",
  "rating",
  "goodreadsRating",
  "hardcoverRating",
  "tmdbRating",
  "imdb",
  "status",
  "watchedAt",
];

function metadataRating(reference: { metadata: unknown }) {
  const record = metadataRecord(reference);
  const raw =
    record.rating ??
    record.goodreadsRating ??
    record.hardcoverRating ??
    record.tmdbRating;
  const value =
    typeof raw === "string" ? Number.parseFloat(raw) : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function metadataRatingScale(reference: { kind?: string; metadata: unknown }) {
  if (reference.kind === "book") return 10;
  const value = metadataRating(reference);
  if (reference.kind === "movie") return value && value > 5 ? 10 : 5;
  return value && value > 5 ? 10 : 5;
}

function metadataRatingLabel(reference: {
  metadata: unknown;
  sourcePath?: string | null;
  source?: string | null;
}) {
  const record = metadataRecord(reference);
  const value = metadataRating(reference);
  const scale = metadataRatingScale(reference);
  const source =
    record.source === "BookLore" || record.bookloreId
      ? "BookLore"
      : reference.source === "obsidian" ||
          reference.sourcePath?.includes("/References/")
        ? "Obsidian"
        : "rating";
  return value ? `${formatRating(value)}/${scale} ${source}` : source;
}

function personalRating(reference: { kind?: string; metadata: unknown }) {
  const value = Number(metadataRecord(reference).myRating);
  const scale = manualRatingScale(reference);
  return Number.isInteger(value) && value >= 1 && value <= scale ? value : null;
}

function manualRatingScale(reference: { kind?: string }) {
  return reference.kind === "book" ? 10 : 5;
}

function formatRating(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function metadataCreator(reference: { metadata: unknown }) {
  const record = metadataRecord(reference);
  const value = record.author ?? record.authors ?? record.director;
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" && value.trim() ? value : null;
}

function metadataYear(reference: { metadata: unknown }) {
  const value = String(metadataRecord(reference).year ?? "").trim();
  return /^\d{4}$/.test(value) ? value : null;
}

function metadataGenres(reference: { metadata: unknown }) {
  const record = metadataRecord(reference);
  const raw = record.genres ?? record.genre ?? record.categories;
  const text = Array.isArray(raw)
    ? raw.join(",")
    : typeof raw === "string"
      ? raw
      : "";
  if (!text.trim()) return null;
  const parts = Array.from(
    new Set(
      text
        .split(/[,/]/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part && part !== "fiction"),
    ),
  );
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

function metadataCast(reference: { metadata: unknown }) {
  const value = metadataRecord(reference).cast;
  const text = Array.isArray(value)
    ? value.join(",")
    : typeof value === "string"
      ? value
      : "";
  if (!text.trim()) return null;
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

function watchStatus(reference: { metadata: unknown }) {
  const record = metadataRecord(reference);
  if (record.watchedAt) {
    return `watched ${formatShortDate(String(record.watchedAt))}`;
  }
  const value = record.status;
  return value === "watched" || value === "unwatched" ? value : null;
}

function sourceUrl(reference: { url: string | null; metadata: unknown }) {
  if (reference.url) return reference.url;
  const imdb = metadataRecord(reference).imdb;
  return typeof imdb === "string" && imdb.trim() ? imdb : null;
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Open source";
  }
}

function kindLabel(kind: string) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function extraMetadata(reference: { metadata: unknown }) {
  return Object.fromEntries(
    Object.entries(metadataRecord(reference)).filter(
      ([key]) => !HERO_METADATA_KEYS.includes(key),
    ),
  );
}

function hasBookLoreSource(reference: {
  metadata: unknown;
  sourcePath: string | null;
}) {
  const metadata = metadataRecord(reference);
  return (
    metadata.source === "BookLore" ||
    typeof metadata.bookloreId === "string" ||
    reference.sourcePath?.startsWith("booklore:")
  );
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value ?? "");
}
