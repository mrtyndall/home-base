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
            Project
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            New project
          </h1>
        </div>
      </header>

      <form
        action={createProject}
        className="max-w-2xl space-y-4 rounded-lg border border-stone-200 bg-white p-4"
      >
        <label className="block text-sm font-medium text-stone-700">
          <span>Name</span>
          <input
            name="name"
            required
            className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
        </label>
        <label className="block text-sm font-medium text-stone-700">
          <span>Area</span>
          <select
            name="areaId"
            required
            className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
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
        <label className="block text-sm font-medium text-stone-700">
          <span>Target date</span>
          <input
            type="date"
            name="targetDate"
            className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
        </label>
        <label className="block text-sm font-medium text-stone-700">
          <span>Start mode</span>
          <select
            name="startMode"
            defaultValue="active"
            className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          >
            <option value="active">Start now</option>
            <option value="someday">Someday</option>
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800"
        >
          <Plus size={16} />
          Create
        </button>
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
