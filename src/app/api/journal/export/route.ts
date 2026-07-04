import { prisma } from "@/lib/db";
import { localDateString } from "@/lib/dates";
import { formatJournalMarkdown } from "@/lib/journal";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await prisma.journalEntry.findMany({
    where: { status: "active" },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
    select: { entryDate: true, bodyMd: true, tags: true },
  });

  const markdown = formatJournalMarkdown(entries);

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="home-base-journal-${localDateString()}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
