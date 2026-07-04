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
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          Projects
        </Link>
        <div>
          <h1 className="font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950">
            {domain.name}
          </h1>
          {domain.description?.trim() ? (
            <p className="mt-2.5 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
              {domain.description}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-[#6B7268]">
            {taskPulse.openTasks} open task{taskPulse.openTasks === 1 ? "" : "s"}
            {" · "}
            {taskPulse.dueToday} due today
            {" · "}
            {projectFacts.activeCount} active project
            {projectFacts.activeCount === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <details>
        <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 px-1 text-[13px] font-medium text-stone-500 transition hover:text-stone-950 [&::-webkit-details-marker]:hidden">
          <Pencil size={12} />
          Edit description
        </summary>
        <form
          action={updateDomainDescription}
          className="mt-2.5 max-w-2xl space-y-3 rounded-[14px] border border-[#E2E6DF] bg-white p-4"
        >
          <input type="hidden" name="domainId" value={domain.id} />
          <label className="block text-sm font-medium text-stone-700">
            <span className="sr-only">Description</span>
            <textarea
              name="description"
              rows={4}
              defaultValue={domain.description ?? ""}
              className="mt-1 w-full rounded-[12px] border border-[#E2E6DF] bg-white px-3.5 py-2.5 text-sm leading-relaxed outline-none transition focus:border-teal-700"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
            >
              Save
            </button>
          </div>
        </form>
      </details>

      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Areas
        </h2>
        {areas.length === 0 ? (
          <p className="text-sm text-[#6B7268]">No areas in this domain.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {areas.map((area) => (
              <Link
                key={area.id}
                href={`/areas/${area.id}`}
                className="rounded-[14px] border border-[#E2E6DF] bg-white px-4 py-3.5 transition hover:border-teal-700/50"
              >
                <div className="flex items-baseline justify-between gap-2.5">
                  <p className="text-[15px] font-medium text-stone-950">{area.name}</p>
                  <p className="shrink-0 text-xs text-[#9AA096]">
                    {area.openTaskCount > 0
                      ? `${area.openTaskCount} open task${area.openTaskCount === 1 ? "" : "s"}`
                      : area.status}
                  </p>
                </div>
                {area.latestCheckIn ? (
                  <p className="mt-1.5 text-[13px] leading-normal text-stone-600">
                    {checkInSnippet(area.latestCheckIn.bodyMd, 110)}{" "}
                    <span className="text-[#9AA096]">
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
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Project facts
          </h2>
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {projectFacts.slipping.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block px-4 py-3 transition hover:bg-[#F7F9F5]"
              >
                <p className="text-sm font-medium text-stone-950">
                  {project.name}
                </p>
                <p className="mt-0.5 text-[13px] text-stone-600">{project.fact}</p>
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
