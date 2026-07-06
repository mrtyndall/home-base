import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, RefreshCw, Star } from "lucide-react";
import {
  setReferenceSnippetStarred,
  syncBookLoreSnippetsAction,
} from "@/app/actions";
import { MarkdownPreview } from "@/components/markdown-preview";
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
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Reference detail
          </p>
          <h1 className="mt-1.5 font-serif text-[30px] font-medium leading-[1.15] tracking-[-0.01em] text-stone-950">
            {reference.title ?? reference.body}
          </h1>
          <p className="mt-2 text-sm text-[#9AA096]">
            {reference.kind} · added {formatShortDate(reference.createdAt)}
          </p>
        </div>
      </header>

      <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
          {metadataCoverUrl(reference) ? (
            <Image
              src={metadataCoverUrl(reference) ?? ""}
              alt=""
              width={112}
              height={168}
              className="w-28 rounded-[10px] border border-[#E2E6DF] object-cover shadow-sm"
            />
          ) : null}
          <div className="min-w-0">
            <MarkdownPreview body={reference.body} mentions={mentions} />
            {reference.url ? (
              <a
                href={reference.url}
                className="mt-4 inline-flex text-sm font-medium text-teal-700 transition hover:text-teal-900"
              >
                Open source
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {hasBookLoreSource(reference) || reference.snippets.length > 0 ? (
        <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
              Highlights & notes
            </h2>
            {hasBookLoreSource(reference) ? (
              <form action={syncBookLoreSnippetsAction}>
                <input type="hidden" name="referenceId" value={reference.id} />
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[#DDE3DA] bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-700 hover:text-teal-800"
                >
                  <RefreshCw size={14} />
                  Sync BookLore
                </button>
              </form>
            ) : null}
          </div>
          {reference.snippets.length > 0 ? (
            <div className="mt-3 divide-y divide-[#EEF1EC]">
              {reference.snippets.map((snippet) => (
                <article
                  key={snippet.id}
                  id={`snippet-${snippet.id}`}
                  className="scroll-mt-24 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
                        {snippet.kind === "note"
                          ? "BookLore note"
                          : "BookLore highlight"}
                        {snippet.location ? ` · ${snippet.location}` : ""}
                      </p>
                      <blockquote className="border-l-2 border-teal-700/40 pl-3 text-base leading-7 text-stone-950">
                        {snippet.quote}
                      </blockquote>
                      {snippet.note ? (
                        <p className="text-sm leading-6 text-stone-700">
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
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[#DDE3DA] bg-white text-stone-500 transition hover:border-teal-700 hover:text-teal-800"
                      >
                        <Star
                          size={17}
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
            <p className="mt-3 text-sm text-[#9AA096]">
              No BookLore highlights synced.
            </p>
          )}
        </section>
      ) : null}

      <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Metadata
        </h2>
        <dl className="mt-3 divide-y divide-[#EEF1EC]">
          {Object.entries(metadataRecord(reference)).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[110px_1fr] gap-3 py-2">
              <dt className="text-xs text-[#9AA096]">{key}</dt>
              <dd className="text-sm text-stone-800">{displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
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
  const coverUrl = metadataRecord(reference).coverUrl;
  return typeof coverUrl === "string" && coverUrl.trim() ? coverUrl : null;
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
