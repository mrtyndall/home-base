import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MarkdownPreview } from "@/components/markdown-preview";
import { SetupNotice } from "@/components/setup-notice";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadJournalSearchDetail } from "@/lib/search-detail-loaders";

export const dynamic = "force-dynamic";

export default async function JournalDetailPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  if (!process.env.DATABASE_URL) return <SetupNotice reason="DATABASE_URL is not configured." />;

  let entry;
  let docs;
  try {
    [entry, docs] = await Promise.all([
      loadJournalSearchDetail(prisma, entryId),
      prisma.entityDoc.findMany({
        where: { parentType: "journal_entry", parentId: entryId, status: "active" },
        orderBy: { updatedAt: "desc" },
        take: 40,
      }),
    ]);
  } catch {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!entry) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-3">
        <Link href="/ideas" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700">
          <ArrowLeft size={15} /> Library
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Journal · {entry.status}
          </p>
          <h1 className="mt-1.5 font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
            {formatDateOnly(entry.entryDate)}
          </h1>
          <p className="mt-2 text-xs text-[#9AA096]">Updated {formatShortDate(entry.updatedAt)}</p>
        </div>
      </header>
      <article className="rounded-[18px] border border-[#E2E6DF] bg-white p-5">
        <MarkdownPreview body={entry.bodyMd} />
      </article>
      {docs.length ? (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">Linked docs</h2>
          {docs.map((doc) => (
            <article key={doc.id} id={`doc-${doc.id}`} className="scroll-mt-24 rounded-[14px] border border-[#E2E6DF] bg-white p-4">
              <h3 className="break-words text-sm font-semibold text-stone-900">{doc.title}</h3>
              <div className="mt-2"><MarkdownPreview body={doc.bodyMd} /></div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
