import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { updateDomainDescription } from "@/app/actions";
import { SetupNotice } from "@/components/setup-notice";
import { checkInSnippet } from "@/lib/checkins";
import { formatShortDate } from "@/lib/dates";
import { getDomainAggregate } from "@/lib/domains";

export const dynamic = "force-dynamic";

type DomainPageProps = {
  params: Promise<{ domainId: string }>;
};

export default async function DomainPage({ params }: DomainPageProps) {
  const { domainId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadDomain(domainId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.domain) {
    notFound();
  }

  const { domain, areas, projectFacts, taskPulse } = result;

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={16} />
          Projects
        </Link>
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-teal-700">
            Domain
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            {domain.name}
          </h1>
          {domain.description?.trim() ? (
            <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-stone-700">
              {domain.description}
            </p>
          ) : null}
        </div>
      </header>

      <details className="rounded-lg border border-stone-200 bg-white p-4">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-stone-700 [&::-webkit-details-marker]:hidden">
          <Pencil size={15} />
          Edit description
        </summary>
        <form action={updateDomainDescription} className="mt-4 space-y-3">
          <input type="hidden" name="domainId" value={domain.id} />
          <label className="block text-sm font-medium text-stone-700">
            <span className="sr-only">Description</span>
            <textarea
              name="description"
              rows={4}
              defaultValue={domain.description ?? ""}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
            >
              Save
            </button>
          </div>
        </form>
      </details>

      <section className="rounded-lg border border-stone-200 bg-white px-4 py-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-700">
          <span>
            {taskPulse.openTasks} open task{taskPulse.openTasks === 1 ? "" : "s"}
          </span>
          <span>
            {taskPulse.dueToday} due today
          </span>
          <span>
            {projectFacts.activeCount} active project
            {projectFacts.activeCount === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-stone-800">Areas</h2>
        {areas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-500">
            No areas in this domain.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {areas.map((area) => (
              <Link
                key={area.id}
                href={`/areas/${area.id}`}
                className="rounded-lg border border-stone-200 bg-white p-4 transition hover:border-teal-400"
              >
                <p className="text-sm font-medium text-stone-900">{area.name}</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {area.status}
                  {area.openTaskCount > 0
                    ? ` · ${area.openTaskCount} open task${area.openTaskCount === 1 ? "" : "s"}`
                    : ""}
                </p>
                {area.latestCheckIn ? (
                  <p className="mt-2 text-sm text-stone-700">
                    {checkInSnippet(area.latestCheckIn.bodyMd, 110)}{" "}
                    <span className="text-stone-500">
                      · {formatShortDate(area.latestCheckIn.createdAt)}
                    </span>
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      {projectFacts.slipping.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-stone-800">
            Project facts
          </h2>
          <div className="space-y-2">
            {projectFacts.slipping.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-lg border border-stone-200 bg-white p-4 transition hover:border-teal-400"
              >
                <p className="text-sm font-medium text-stone-900">
                  {project.name}
                </p>
                <p className="mt-0.5 text-sm text-stone-600">{project.fact}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

async function loadDomain(domainId: string) {
  try {
    const aggregate = await getDomainAggregate(domainId);
    if (!aggregate) {
      return { ok: true as const, domain: null };
    }
    return { ok: true as const, ...aggregate };
  } catch {
    return { ok: false as const };
  }
}
