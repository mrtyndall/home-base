import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MarkdownPreview } from "@/components/markdown-preview";
import { SetupNotice } from "@/components/setup-notice";
import { formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadIdeaSearchDetail } from "@/lib/search-detail-loaders";

export const dynamic = "force-dynamic";

export default async function IdeaDetailPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  if (!process.env.DATABASE_URL) return <SetupNotice reason="DATABASE_URL is not configured." />;

  let idea;
  try {
    idea = await loadIdeaSearchDetail(prisma, ideaId);
  } catch {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!idea) notFound();

  const location = idea.project?.name ?? idea.area?.name ?? "Inbox";
  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-3">
        <Link href="/ideas#ideas" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700">
          <ArrowLeft size={15} /> Library
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Idea · {idea.status} · {location}
          </p>
          <h1 className="mt-1.5 break-words font-serif text-[30px] font-medium leading-[1.15] tracking-[-0.01em] text-stone-950">
            {idea.title}
          </h1>
          <p className="mt-2 text-xs text-[#9AA096]">Updated {formatShortDate(idea.updatedAt)}</p>
        </div>
      </header>
      <article className="rounded-[18px] border border-[#E2E6DF] bg-white p-5">
        {idea.body ? <MarkdownPreview body={idea.body} /> : <p className="text-sm text-[#6B7268]">No notes on this idea yet.</p>}
        {idea.tags.length ? <p className="mt-4 text-xs text-[#9AA096]">{idea.tags.join(" · ")}</p> : null}
      </article>
    </div>
  );
}
