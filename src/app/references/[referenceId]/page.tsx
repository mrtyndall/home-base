import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
        <MarkdownPreview body={reference.body} mentions={mentions} />
        {reference.url ? (
          <a
            href={reference.url}
            className="mt-4 inline-flex text-sm font-medium text-teal-700 transition hover:text-teal-900"
          >
            Open source
          </a>
        ) : null}
      </section>

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

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value ?? "");
}
