import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  parkArea,
  retireArea,
  unparkArea,
  updateAreaState,
} from "@/app/actions";
import { SetupNotice } from "@/components/setup-notice";
import { EntityDepth } from "@/components/entity-depth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type AreaPageProps = {
  params: Promise<{ areaId: string }>;
};

export default async function AreaPage({ params }: AreaPageProps) {
  const { areaId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadArea(areaId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.area) {
    notFound();
  }

  const { area } = result;

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
            Area
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            {area.name}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {area.domain.name} / {area.status}
            {area.tendingCadence ? ` / ${area.tendingCadence}` : ""}
          </p>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <form
          action={updateAreaState}
          className="space-y-4 rounded-lg border border-stone-200 bg-white p-4"
        >
          <input type="hidden" name="areaId" value={area.id} />
          <label className="block text-sm font-medium text-stone-700">
            <span>Current state</span>
            <textarea
              name="currentState"
              rows={5}
              defaultValue={area.currentState ?? ""}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            <span>Next step</span>
            <textarea
              name="nextStep"
              rows={3}
              defaultValue={area.nextStep ?? ""}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
            >
              Save state
            </button>
          </div>
        </form>

        <aside className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-base font-semibold text-stone-800">Status</h2>
          {area.status === "active" ? (
            <div className="space-y-2">
              <AreaStatusButton action={parkArea} areaId={area.id} label="Park" />
              <AreaStatusButton
                action={retireArea}
                areaId={area.id}
                label="Retire"
                tone="quiet"
              />
            </div>
          ) : area.status === "parked" ? (
            <AreaStatusButton action={unparkArea} areaId={area.id} label="Unpark" />
          ) : (
            <p className="text-sm text-stone-600">
              This area remains searchable with its notes and history.
            </p>
          )}
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Standing tasks" empty="No open standing tasks.">
          {area.tasks.map((task) => (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="block py-2 text-sm font-medium text-stone-800 transition hover:text-teal-700"
            >
              {task.title}
            </Link>
          ))}
        </Panel>

        <Panel title="Projects" empty="No projects in this area.">
          {area.projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block py-2 transition hover:text-teal-700"
            >
              <p className="text-sm font-medium text-stone-800">{project.name}</p>
              <p className="mt-0.5 text-xs text-stone-500">
                {project.currentState}
              </p>
            </Link>
          ))}
        </Panel>

        <Panel title="Linked ideas" empty="No linked ideas.">
          {area.ideas.map((idea) => (
            <Link
              key={idea.id}
              href="/ideas"
              className="block py-2 text-sm font-medium text-stone-800 transition hover:text-teal-700"
            >
              {idea.title}
            </Link>
          ))}
        </Panel>
      </section>

      <EntityDepth
        parentType="area"
        parentId={area.id}
        notes={area.notes}
        docs={area.docs}
        attachments={area.attachments}
      />
    </div>
  );
}

function AreaStatusButton({
  action,
  areaId,
  label,
  tone = "primary",
}: {
  action: (formData: FormData) => Promise<void>;
  areaId: string;
  label: string;
  tone?: "primary" | "quiet";
}) {
  return (
    <form action={action}>
      <input type="hidden" name="areaId" value={areaId} />
      <button
        type="submit"
        className={
          tone === "primary"
            ? "inline-flex h-9 w-full items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800"
            : "inline-flex h-9 w-full items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400"
        }
      >
        {label}
      </button>
    </form>
  );
}

function Panel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-base font-semibold text-stone-800">{title}</h2>
      {children.length === 0 ? (
        <p className="text-sm text-stone-500">{empty}</p>
      ) : (
        <div className="divide-y divide-stone-100">{children}</div>
      )}
    </div>
  );
}

async function loadArea(areaId: string) {
  try {
    const area = await prisma.area.findUnique({
      where: { id: areaId },
      include: {
        domain: true,
        tasks: {
          where: { status: "open", projectId: null },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          take: 20,
        },
        projects: {
          where: { status: { in: ["active", "someday", "parked"] } },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 20,
        },
        ideas: {
          where: { status: { in: ["seed", "developing"] } },
          orderBy: { updatedAt: "desc" },
          take: 12,
        },
      },
    });

    const [notes, docs, attachments] = area
      ? await Promise.all([
          prisma.entityNote.findMany({
            where: { parentType: "area", parentId: area.id },
            orderBy: { createdAt: "desc" },
            take: 12,
          }),
          prisma.entityDoc.findMany({
            where: { parentType: "area", parentId: area.id, status: "active" },
            orderBy: { updatedAt: "desc" },
            take: 12,
          }),
          prisma.document.findMany({
            where: { parentType: "area", parentId: area.id },
            orderBy: { createdAt: "desc" },
            take: 12,
          }),
        ])
      : [[], [], []];

    return {
      ok: true as const,
      area: area ? { ...area, notes, docs, attachments } : null,
    };
  } catch {
    return { ok: false as const };
  }
}
