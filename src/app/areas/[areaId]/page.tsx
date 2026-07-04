import type { ReactNode } from "react";
import type { Area, Capture, Domain, ScheduledReview } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ellipsis } from "lucide-react";
import {
  convertPendingCapture,
  parkAreaById,
  retireAreaById,
  unparkAreaById,
} from "@/app/actions";
import {
  dismissReview,
  markReviewDone,
  snoozeReview,
} from "@/app/review-actions";
import { SetupNotice } from "@/components/setup-notice";
import { CheckInFeed } from "@/components/check-in-feed";
import { EntityDepth } from "@/components/entity-depth";
import { checkInSnippet, getLatestCheckIns } from "@/lib/checkins";
import {
  dateOnlyFromString,
  formatDateOnly,
  formatShortDate,
  localDateString,
} from "@/lib/dates";
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

  const { area, pendingCaptures, reviews, domains } = result;

  const latestCheckIn = area.checkIns[0] ?? null;

  return (
    <div className="space-y-6">
      <header className="space-y-3 lg:border-b lg:border-[#DDE2DA] lg:pb-5">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          Projects
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/domains/${area.domain.id}`}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096] transition hover:text-teal-700"
            >
              {area.domain.name}
            </Link>
            <h1 className="mt-1.5 font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950 lg:text-[32px]">
              {area.name}
            </h1>
            <p className="mt-1.5 text-[13px] text-stone-500">
              {area.status.charAt(0).toUpperCase() + area.status.slice(1)}
              {area.tendingCadence ? ` · tend ${area.tendingCadence}` : ""}
            </p>
            {latestCheckIn ? (
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-stone-700">
                {checkInSnippet(latestCheckIn.bodyMd, 160)}
              </p>
            ) : null}
          </div>
          <AreaOverflowMenu areaId={area.id} status={area.status} />
        </div>
      </header>

      {area.id === "area_inbox" ? (
        <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-6">
            <NeedsReviewPanel reviews={reviews} domains={domains} />
            <PendingCapturesPanel
              captures={pendingCaptures}
              domains={domains}
            />
          </div>
          <div className="space-y-6">
            <CheckInFeed
              parentType="area"
              parentId={area.id}
              checkIns={area.checkIns}
            />
            <EntityDepth
              parentType="area"
              parentId={area.id}
              notes={area.notes}
              docs={area.docs}
              attachments={area.attachments}
              variant="project"
            />
          </div>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-6">
            <CheckInFeed
              parentType="area"
              parentId={area.id}
              checkIns={area.checkIns}
            />
            <Panel title="Standing tasks">
              {area.tasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="block px-4 py-3 text-sm font-medium text-stone-900 transition hover:bg-[#F7F9F5]"
                >
                  {task.title}
                </Link>
              ))}
            </Panel>
          </div>
          <div className="space-y-6">
            <Panel title="Projects">
              {area.projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block px-4 py-3 transition hover:bg-[#F7F9F5]"
                >
                  <p className="text-sm font-medium text-stone-800">
                    {project.name}
                  </p>
                  {project.latestCheckIn ? (
                    <p className="mt-0.5 text-xs text-[#9AA096]">
                      {checkInSnippet(project.latestCheckIn.bodyMd, 100)} ·{" "}
                      {formatShortDate(project.latestCheckIn.createdAt)}
                    </p>
                  ) : null}
                </Link>
              ))}
            </Panel>

            <Panel title="Linked ideas">
              {area.ideas.map((idea) => (
                <Link
                  key={idea.id}
                  href="/ideas"
                  className="block px-4 py-3 text-sm font-medium text-stone-900 transition hover:bg-[#F7F9F5]"
                >
                  {idea.title}
                </Link>
              ))}
            </Panel>

            <EntityDepth
              parentType="area"
              parentId={area.id}
              notes={area.notes}
              docs={area.docs}
              attachments={area.attachments}
              variant="project"
            />
          </div>
        </section>
      )}
    </div>
  );
}

type ReviewRow = ScheduledReview & { capture: Pick<Capture, "rawText"> };

function NeedsReviewPanel({
  reviews,
  domains,
}: {
  reviews: ReviewRow[];
  domains: Array<Domain & { areas: Area[] }>;
}) {
  if (reviews.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Needs review{" "}
        <span className="font-medium text-[#B0ACA2]">{reviews.length}</span>
      </h2>
      <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
        {reviews.map((review) => (
          <div key={review.id} className="p-4">
            <p className="max-h-48 overflow-y-auto rounded-[10px] bg-[#F7F9F5] px-3 py-2.5 text-sm leading-relaxed text-stone-800">
              {review.capture.rawText}
            </p>
            <p className="mt-2 text-xs text-[#9AA096]">
              {review.reviewAt
                ? `Review date ${formatDateOnly(review.reviewAt)}`
                : `Waiting: ${review.conditionText}`}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <FileAsDisclosure
                captureId={review.captureId}
                reviewId={review.id}
                domains={domains}
              />
              <details className="relative">
                <summary className="inline-flex h-[30px] cursor-pointer list-none items-center rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
                  Snooze…
                </summary>
                <form
                  action={snoozeReview}
                  className="absolute left-0 z-20 mt-2 flex w-max items-center gap-1.5 rounded-[18px] border border-white/65 bg-[#FAFBF9]/80 p-2 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150"
                >
                  <input type="hidden" name="reviewId" value={review.id} />
                  <label className="sr-only" htmlFor={`snooze-${review.id}`}>
                    Snooze until
                  </label>
                  <input
                    id={`snooze-${review.id}`}
                    type="date"
                    name="snoozeUntil"
                    required
                    className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-2.5 text-[13px] outline-none focus:border-teal-700"
                  />
                  <button
                    type="submit"
                    className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
                  >
                    Snooze
                  </button>
                </form>
              </details>
              <form action={markReviewDone}>
                <input type="hidden" name="reviewId" value={review.id} />
                <button
                  type="submit"
                  className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
                >
                  Done
                </button>
              </form>
              <form action={dismissReview}>
                <input type="hidden" name="reviewId" value={review.id} />
                <button
                  type="submit"
                  className="h-[30px] px-2 text-[13px] font-medium text-stone-500 transition hover:text-stone-950"
                >
                  Dismiss
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </section>
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
    <section className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Pending captures{" "}
        <span className="font-medium text-[#B0ACA2]">{captures.length}</span>
      </h2>
      <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
        {captures.map((capture) => (
          <div key={capture.id} className="p-4">
            <p className="max-h-48 overflow-y-auto rounded-[10px] bg-[#F7F9F5] px-3 py-2.5 text-sm leading-relaxed text-stone-800">
              {capture.rawText}
            </p>
            <div className="mt-2.5">
              <FileAsDisclosure captureId={capture.id} domains={domains} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FileAsDisclosure({
  captureId,
  reviewId,
  domains,
}: {
  captureId: string;
  reviewId?: string;
  domains: Array<Domain & { areas: Area[] }>;
}) {
  return (
    <details className="relative">
      <summary className="inline-flex h-[30px] cursor-pointer list-none items-center rounded-full border border-teal-700/40 bg-white px-3 text-[13px] font-medium text-teal-800 transition hover:border-teal-700 [&::-webkit-details-marker]:hidden">
        File as…
      </summary>
      <form
        action={convertPendingCapture}
        className="absolute left-0 z-20 mt-2 w-[270px] rounded-[18px] border border-white/65 bg-[#FAFBF9]/80 p-3 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150"
      >
        <input type="hidden" name="captureId" value={captureId} />
        {reviewId ? (
          <input type="hidden" name="reviewId" value={reviewId} />
        ) : null}
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          File as
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <ConvertButton value="task" label="Task" />
          <ConvertButton value="idea" label="Idea" />
          <ConvertButton value="note" label="Note" />
          <ConvertButton value="reference" label="Reference" />
        </div>
        <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Into
        </p>
        <label className="mt-1.5 block">
          <span className="sr-only">Area</span>
          <select
            name="areaId"
            defaultValue="area_inbox"
            className="h-[30px] min-w-0 rounded-full border border-[#E2E6DF] bg-white px-2.5 text-[13px] outline-none focus:border-teal-700"
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
      </form>
    </details>
  );
}

function ConvertButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="submit"
      name="targetType"
      value={value}
      className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
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
        className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full text-stone-500 transition hover:bg-white hover:text-stone-950 [&::-webkit-details-marker]:hidden"
      >
        <Ellipsis size={17} />
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-40 rounded-[18px] border border-white/65 bg-[#FAFBF9]/80 p-1.5 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150">
        {status === "active" ? (
          <>
            <AreaMenuAction
              action={parkAreaById.bind(null, areaId)}
              label="Park"
            />
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
        className="flex h-10 w-full items-center rounded-[10px] px-2.5 text-left text-sm text-stone-700 transition hover:bg-white/85 hover:text-stone-950"
      >
        {label}
      </button>
    </form>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode[] }) {
  return (
    <div className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        {title}{" "}
        {children.length > 0 ? (
          <span className="font-medium text-[#B0ACA2]">{children.length}</span>
        ) : null}
      </h2>
      {children.length === 0 ? null : (
        <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
          {children}
        </div>
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

    const today = dateOnlyFromString(localDateString());
    const [
      notes,
      docs,
      attachments,
      checkIns,
      latestProjectCheckIns,
      pendingCaptures,
      reviews,
    ] = area
      ? await Promise.all([
          prisma.entityNote.findMany({
            where: { parentType: "area", parentId: area.id },
            orderBy: { createdAt: "desc" },
            take: 80,
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
          prisma.checkIn.findMany({
            where: { parentType: "area", parentId: area.id },
            orderBy: { createdAt: "desc" },
            take: 15,
          }),
          getLatestCheckIns(
            "project",
            area.projects.map((project) => project.id),
          ),
          area.id === "area_inbox"
            ? prisma.capture.findMany({
                where: {
                  OR: [{ parseStatus: "ambiguous" }, { parseStatus: "failed" }],
                },
                orderBy: { createdAt: "desc" },
                take: 20,
              })
            : Promise.resolve([]),
          area.id === "area_inbox"
            ? prisma.scheduledReview.findMany({
                where: {
                  OR: [
                    { status: "surfaced" },
                    { status: "pending", reviewAt: { lte: today } },
                    { status: "pending", reviewAt: null },
                  ],
                },
                include: { capture: { select: { rawText: true } } },
                orderBy: [{ reviewAt: "asc" }, { createdAt: "asc" }],
                take: 30,
              })
            : Promise.resolve([]),
        ])
      : [
          [],
          [],
          [],
          [],
          new Map<string, { bodyMd: string; createdAt: Date }>(),
          [],
          [],
        ];

    return {
      ok: true as const,
      area: area
        ? {
            ...area,
            notes,
            docs,
            attachments,
            checkIns,
            projects: area.projects.map((project) => ({
              ...project,
              latestCheckIn: latestProjectCheckIns.get(project.id) ?? null,
            })),
          }
        : null,
      pendingCaptures,
      reviews,
      domains,
    };
  } catch {
    return { ok: false as const };
  }
}
