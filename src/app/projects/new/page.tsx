import type { Area, Domain } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { createProject } from "@/app/actions";
import { prisma } from "@/lib/db";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadDomains();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

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
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          New project
        </h1>
      </header>

      <form
        action={createProject}
        className="max-w-2xl space-y-4 rounded-[14px] border border-[#E2E6DF] bg-white p-4"
      >
        <label className="block text-[13px] font-medium text-stone-600">
          <span>Name</span>
          <input
            name="name"
            required
            className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
          />
        </label>
        <label className="block text-[13px] font-medium text-stone-600">
          <span>Area</span>
          <select
            name="areaId"
            required
            className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
            defaultValue={result.domains[0]?.areas[0]?.id ?? ""}
          >
            {result.domains.map((domain) => (
              <optgroup key={domain.id} label={domain.name}>
                {domain.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block text-[13px] font-medium text-stone-600">
          <span>Target date</span>
          <input
            type="date"
            name="targetDate"
            className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
          />
        </label>
        <fieldset>
          <legend className="text-[13px] font-medium text-stone-600">
            Start mode
          </legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <label className="cursor-pointer rounded-[14px] border border-[#E2E6DF] bg-white p-3.5 transition hover:border-teal-700/40 has-[:checked]:border-teal-700 has-[:checked]:bg-[#F5FAF8] has-[:focus-visible]:border-teal-700">
              <input
                type="radio"
                name="startMode"
                value="active"
                defaultChecked
                className="sr-only"
              />
              <span className="block text-sm font-medium text-stone-950">
                Start now
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-stone-600">
                Currently being worked.
              </span>
            </label>
            <label className="cursor-pointer rounded-[14px] border border-[#E2E6DF] bg-white p-3.5 transition hover:border-teal-700/40 has-[:checked]:border-teal-700 has-[:checked]:bg-[#F5FAF8] has-[:focus-visible]:border-teal-700">
              <input
                type="radio"
                name="startMode"
                value="someday"
                className="sr-only"
              />
              <span className="block text-sm font-medium text-stone-950">
                Someday
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-stone-600">
                Wanted, not committed.
              </span>
            </label>
          </div>
        </fieldset>
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-teal-700 px-[18px] text-sm font-medium text-white transition hover:bg-teal-800"
          >
            <Plus size={14} />
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

async function loadDomains() {
  try {
    const domains = await prisma.domain.findMany({
      where: { active: true, isSystem: false },
      orderBy: { sortOrder: "asc" },
      include: {
        areas: {
          where: { status: "active" },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
    });

    return { ok: true as const, domains };
  } catch {
    return {
      ok: false as const,
      domains: [] as Array<Domain & { areas: Area[] }>,
    };
  }
}
