import type { ReactNode } from "react";
import type { Area, Capture, Domain } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ellipsis, Pencil } from "lucide-react";
import {
  convertPendingCapture,
  parkAreaById,
  retireAreaById,
  unparkAreaById,
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

  const { area, pendingCaptures, domains } = result;

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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-teal-700">
              {area.domain.name}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">
              {area.name}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {area.status}
              {area.tendingCadence ? ` / ${area.tendingCadence}` : ""}
            </p>
            {area.currentState?.trim() ? (
              <p className="mt-3 max-w-2xl text-sm text-stone-700">
                {area.currentState}
              </p>
            ) : null}
          </div>
          <AreaOverflowMenu areaId={area.id} status={area.status} />
        </div>
      </header>

      <details className="rounded-lg border border-stone-200 bg-white p-4">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-stone-700 [&::-webkit-details-marker]:hidden">
          <Pencil size={15} />
          Edit state
        </summary>
        <form action={updateAreaState} className="mt-4 space-y-4">
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
      </details>

      {area.id === "area_inbox" ? (
        <PendingCapturesPanel captures={pendingCaptures} domains={domains} />
      ) : null}

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

function PendingCapturesPanel({
  captures,
  domains,
}: {
  captures: Capture[];
  domains: Array<Domain & { areas: Area[] }>;
}) {
  if (captures.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-stone-800">Pending captures</h2>
      <div className="space-y-3">
        {captures.map((capture) => (
          <form
            key={capture.id}
            action={convertPendingCapture}
            className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
          >
            <input type="hidden" name="captureId" value={capture.id} />
            <div className="space-y-3">
              <p className="max-h-48 overflow-y-auto rounded-md border border-stone-100 bg-stone-50 p-3 text-sm leading-6 text-stone-800">
                {capture.rawText}
              </p>
              <div className="flex flex-col gap-3 border-t border-stone-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex min-w-0 items-center gap-2 text-sm text-stone-600">
                  <span className="shrink-0 font-medium text-stone-700">
                    Area
                  </span>
                  <select
                    name="areaId"
                    defaultValue="area_inbox"
                    className="h-9 min-w-0 rounded-md border border-stone-300 bg-white px-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  >
                    {domains.map((domain) => (
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
                <div className="flex flex-wrap gap-2">
                  <ConvertButton value="task" label="Task" />
                  <ConvertButton value="idea" label="Idea" />
                  <ConvertButton value="note" label="Note" />
                  <ConvertButton value="reference" label="Reference" />
                </div>
              </div>
            </div>
          </form>
        ))}
      </div>
    </section>
  );
}

function ConvertButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="submit"
      name="targetType"
      value={value}
      className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
    >
      {label}
    </button>
  );
}

function AreaOverflowMenu({
  areaId,
  status,
}: {
  areaId: string;
  status: "active" | "parked" | "retired";
}) {
  if (status === "retired") {
    return null;
  }

  return (
    <details className="relative">
      <summary
        title="Area actions"
        className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-stone-300 hover:text-stone-950 [&::-webkit-details-marker]:hidden"
      >
        <Ellipsis size={17} />
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-40 rounded-md border border-stone-200 bg-white p-1 shadow-lg">
        {status === "active" ? (
          <>
            <AreaMenuAction action={parkAreaById.bind(null, areaId)} label="Park" />
            <AreaMenuAction
              action={retireAreaById.bind(null, areaId)}
              label="Retire"
            />
          </>
        ) : null}
        {status === "parked" ? (
          <AreaMenuAction
            action={unparkAreaById.bind(null, areaId)}
            label="Unpark"
          />
        ) : null}
      </div>
    </details>
  );
}

function AreaMenuAction({
  action,
  label,
}: {
  action: () => Promise<void>;
  label: string;
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="flex h-9 w-full items-center rounded px-2 text-left text-sm text-stone-700 transition hover:bg-stone-50 hover:text-stone-950"
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
    const [area, domains] = await Promise.all([
      prisma.area.findUnique({
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
      }),
      prisma.domain.findMany({
        where: { active: true },
        orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
        include: {
          areas: {
            where: { status: "active" },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
      }),
    ]);

    const [notes, docs, attachments, pendingCaptures] = area
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
          area.id === "area_inbox"
            ? prisma.capture.findMany({
                where: {
                  OR: [{ parseStatus: "ambiguous" }, { parseStatus: "failed" }],
                },
                orderBy: { createdAt: "desc" },
                take: 20,
              })
            : Promise.resolve([]),
        ])
      : [[], [], [], []];

    return {
      ok: true as const,
      area: area ? { ...area, notes, docs, attachments } : null,
      pendingCaptures,
      domains,
    };
  } catch {
    return { ok: false as const };
  }
}
