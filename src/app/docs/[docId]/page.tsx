import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MarkdownPreview } from "@/components/markdown-preview";
import { SetupNotice } from "@/components/setup-notice";
import { formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadDocSearchDetail } from "@/lib/search-detail-loaders";

export const dynamic = "force-dynamic";

export default async function DocDetailPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  if (!process.env.DATABASE_URL) return <SetupNotice reason="DATABASE_URL is not configured." />;

  let doc;
  try {
    doc = await loadDocSearchDetail(prisma, docId);
  } catch {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!doc) notFound();

  const backHref = doc.parentType === "area" && doc.parentId
    ? `/areas/${doc.parentId}`
    : doc.parentType === "project" && doc.parentId
      ? `/projects/${doc.parentId}`
      : doc.parentType === "journal_entry" && doc.parentId
        ? `/journal/${doc.parentId}`
        : "/areas/inbox";

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-3">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700">
          <ArrowLeft size={15} /> Back
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Doc · {doc.status}
          </p>
          <h1 className="mt-1.5 break-words font-serif text-[30px] font-medium leading-[1.15] tracking-[-0.01em] text-stone-950">
            {doc.title}
          </h1>
          <p className="mt-2 text-xs text-[#9AA096]">Updated {formatShortDate(doc.updatedAt)}</p>
        </div>
      </header>
      <article className="rounded-[18px] border border-[#E2E6DF] bg-white p-5">
        <MarkdownPreview body={doc.bodyMd} />
      </article>
    </div>
  );
}
