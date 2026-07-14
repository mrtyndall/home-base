import type { Area } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { createProject } from "@/app/actions";
import { prisma } from "@/lib/db";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

type NewProjectPageProps = {
  searchParams: Promise<{ areaId?: string | string[] }>;
};

export default async function NewProjectPage({ searchParams }: NewProjectPageProps) {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const requested = (await searchParams).areaId;
  const requestedAreaId = Array.isArray(requested) ? requested[0] : requested;
  const result = await loadAreas(requestedAreaId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const scopedArea = result.scopedArea;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href={scopedArea ? `/areas/${scopedArea.id}` : "/projects"}
          className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-stone-600 transition hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
        >
          <ArrowLeft size={15} />
          {scopedArea?.name ?? "Areas"}
        </Link>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          New project
        </h1>
        {scopedArea ? (
          <p className="text-sm text-[#6B7268]">
            Create in <span className="font-medium text-stone-900">{scopedArea.name}</span>
          </p>
        ) : null}
      </header>

      {result.areas.length === 0 ? (
        <section className="max-w-2xl rounded-[18px] border border-[#E2E6DF] bg-white p-5">
          <p className="font-serif text-xl text-stone-950">Projects need an Area.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6B7268]">
            Create an ongoing part of life first, then give this project a home.
          </p>
          <Link
            href="/areas/new"
            className="mt-4 inline-flex h-10 items-center rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
          >
            Create your first area
          </Link>
        </section>
      ) : (
        <form
          action={createProject}
          className="max-w-2xl space-y-4 rounded-[14px] border border-[#E2E6DF] bg-white p-4"
        >
          <label className="block text-[13px] font-medium text-stone-600">
            <span>Name</span>
            <input
              name="name"
              required
              autoFocus
              className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
            />
          </label>
          {scopedArea ? (
            <input type="hidden" name="areaId" value={scopedArea.id} />
          ) : (
            <label className="block text-[13px] font-medium text-stone-600">
              <span>Area</span>
              <select
                name="areaId"
                required
                defaultValue=""
                className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
              >
                <option value="" disabled>Choose an area</option>
                {result.areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-[13px] font-medium text-stone-600">
            <span>Target date</span>
            <input type="date" name="targetDate" className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700" />
          </label>
          <fieldset>
            <legend className="text-[13px] font-medium text-stone-600">Start mode</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {[
                ["active", "Start now", "Currently being worked."],
                ["someday", "Someday", "Wanted, not committed."],
              ].map(([value, label, detail], index) => (
                <label key={value} className="cursor-pointer rounded-[14px] border border-[#E2E6DF] bg-white p-3.5 transition hover:border-teal-700/40 has-[:checked]:border-teal-700 has-[:checked]:bg-[#F5FAF8] has-[:focus-visible]:border-teal-700">
                  <input type="radio" name="startMode" value={value} defaultChecked={index === 0} className="sr-only" />
                  <span className="block text-sm font-medium text-stone-950">{label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-stone-600">{detail}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end">
            <button type="submit" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-teal-700 px-[18px] text-sm font-medium text-white transition hover:bg-teal-800">
              <Plus size={14} /> Create project
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

async function loadAreas(requestedAreaId?: string) {
  try {
    const [areas, scopedArea] = await Promise.all([
      prisma.area.findMany({
        where: { status: "active", isSystem: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      requestedAreaId
        ? prisma.area.findFirst({
            where: { id: requestedAreaId, status: "active", isSystem: false },
          })
        : Promise.resolve(null),
    ]);
    return { ok: true as const, areas, scopedArea };
  } catch {
    return { ok: false as const, areas: [] as Area[], scopedArea: null };
  }
}
