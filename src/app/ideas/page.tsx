import { prisma } from "@/lib/db";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadIdeas();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { ideas } = result;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Ideas</h1>
      </header>
      <section className="grid gap-3 md:grid-cols-2">
        {ideas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
            No active ideas.
          </div>
        ) : (
          ideas.map((idea) => (
            <article
              key={idea.id}
              className="rounded-lg border border-stone-200 bg-white p-4"
            >
              <h2 className="font-semibold">{idea.title}</h2>
              <p className="mt-1 text-sm text-stone-500">
                {idea.project?.name ?? idea.area?.name ?? "No area"} / {idea.status}
              </p>
              {idea.body ? (
                <p className="mt-3 text-sm text-stone-800">{idea.body}</p>
              ) : null}
              {idea.tags.length > 0 ? (
                <p className="mt-3 text-xs text-teal-700">
                  {idea.tags.join(", ")}
                </p>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

async function loadIdeas() {
  try {
    const ideas = await prisma.idea.findMany({
      where: { status: { in: ["seed", "developing"] } },
      include: { area: true, project: true },
      orderBy: { updatedAt: "desc" },
      take: 80,
    });

    return { ok: true as const, ideas };
  } catch {
    return { ok: false as const };
  }
}
