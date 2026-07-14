import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MarkdownPreview } from "@/components/markdown-preview";
import { SetupNotice } from "@/components/setup-notice";
import { formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadReferenceMentions } from "@/lib/reference-mentions";

export const dynamic = "force-dynamic";

type NotePageProps = {
  params: Promise<{ noteId: string }>;
};

export default async function NotePage({ params }: NotePageProps) {
  const { noteId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadNote(noteId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.note) {
    notFound();
  }

  const { note, parent, mentions } = result;

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-3">
        <Link
          href={parent.href}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          {parent.label}
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Note · {formatShortDate(note.createdAt)}
          </p>
          <h1 className="mt-1.5 font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950">
            {parent.label}
          </h1>
        </div>
      </header>

      <article className="rounded-[18px] border border-[#E2E6DF] bg-white p-5">
        <MarkdownPreview body={note.bodyMd} mentions={mentions} />
        {mentions.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {mentions.map((mention) => (
              <Link
                key={`${mention.targetType}:${mention.targetId}`}
                href={mention.href}
                className="inline-flex h-8 items-center rounded-full border border-[#E2E6DF] bg-white px-3 text-sm font-medium text-teal-700 transition hover:border-teal-700/50"
              >
                @{mention.label}
              </Link>
            ))}
          </div>
        ) : null}
      </article>
    </div>
  );
}

async function loadNote(noteId: string) {
  try {
    const note = await prisma.entityNote.findUnique({ where: { id: noteId } });
    if (!note) {
      return { ok: true as const, note: null, parent: null, mentions: [] };
    }

    const parent = !note.parentType || !note.parentId
      ? null
      : note.parentType === "area"
        ? await prisma.area.findUnique({
            where: { id: note.parentId },
            select: { id: true, name: true },
          })
        : await prisma.project.findUnique({
            where: { id: note.parentId },
            select: { id: true, name: true },
          });
    const mentionMap = await loadReferenceMentions("entity_note", [note.id]);

    return {
      ok: true as const,
      note,
      parent: {
        label:
          parent?.name ?? (!note.parentType ? "Inbox" : note.parentType === "area" ? "Area" : "Project"),
        href:
          !note.parentType || !note.parentId
            ? "/areas/inbox"
            : note.parentType === "area"
            ? `/areas/${note.parentId}`
            : `/projects/${note.parentId}`,
      },
      mentions: mentionMap.get(note.id) ?? [],
    };
  } catch {
    return { ok: false as const, note: null, parent: null, mentions: [] };
  }
}
