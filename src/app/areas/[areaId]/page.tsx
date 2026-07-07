import type { ReactNode } from "react";
import type {
  Area,
  Capture,
  CaptureReviewProposal,
  Domain,
  ScheduledReview,
} from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ellipsis } from "lucide-react";
import {
  dismissCapture,
  dismissCaptureReviewProposal,
  parkAreaById,
  retireAreaById,
  snoozeCaptureReviewProposalOneDay,
  updateCaptureText,
  unparkAreaById,
} from "@/app/actions";
import {
  dismissReview,
  markReviewDone,
  snoozeReviewOneDay,
} from "@/app/review-actions";
import { CaptureFileActions } from "@/components/capture-file-actions";
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
import { loadReferenceMentions } from "@/lib/reference-mentions";

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

  const { area, pendingCaptures, reviewProposals, reviews, domains } = result;

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
              {area.id === "area_inbox"
                ? "Captures and reviews that still need a home."
                : area.status.charAt(0).toUpperCase() + area.status.slice(1)}
              {area.id !== "area_inbox" && area.tendingCadence
                ? ` · tend ${area.tendingCadence}`
                : ""}
            </p>
            {area.id !== "area_inbox" && latestCheckIn ? (
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
          <NeedsReviewPanel
            reviews={reviews}
            reviewProposals={reviewProposals}
            domains={domains}
          />
          <PendingCapturesPanel captures={pendingCaptures} domains={domains} />
        </section>
      ) : null}

      {area.id === "area_inbox" ? null : (
        <CheckInFeed
          parentType="area"
          parentId={area.id}
          checkIns={area.checkIns}
        />
      )}

      {area.id === "area_inbox" ? null : (
        <AreaHubOverview
          area={area}
          pendingCaptureCount={pendingCaptures.length}
          reviewCount={reviews.length}
        />
      )}

      <EntityDepth
        parentType="area"
        parentId={area.id}
        notes={area.notes}
        docs={area.docs}
        attachments={area.attachments}
        variant="project"
      />

      {area.id === "area_inbox" ? null : (
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr]">
          <div className="space-y-6">
            <Panel title="Projects in this area">
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
          </div>

          <div className="space-y-6">
            <Panel title="Standing tasks">
              {area.tasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="block px-4 py-3 text-sm font-medium text-stone-900 transition hover:bg-[#F7F9F5]"
                >
                  {task.title}
                  {task.dueDate ? (
                    <span className="ml-2 text-xs font-normal text-[#9AA096]">
                      {formatDateOnly(task.dueDate)}
                    </span>
                  ) : null}
                </Link>
              ))}
            </Panel>
          </div>
        </section>
      )}
    </div>
  );
}

type AreaHubOverviewArea = NonNullable<
  Awaited<ReturnType<typeof loadArea>> extends infer Result
    ? Result extends { ok: true; area: infer LoadedArea | null }
      ? LoadedArea
      : never
    : never
>;

function AreaHubOverview({
  area,
  pendingCaptureCount,
  reviewCount,
}: {
  area: AreaHubOverviewArea;
  pendingCaptureCount: number;
  reviewCount: number;
}) {
  const facts = [
    `${area.tasks.length} standing task${area.tasks.length === 1 ? "" : "s"}`,
    `${area.projects.length} project${area.projects.length === 1 ? "" : "s"}`,
    area.importantNoteCount > 0
      ? `${area.importantNoteCount} important note${area.importantNoteCount === 1 ? "" : "s"}`
      : null,
    area.docs.length > 0
      ? `${area.docs.length} doc${area.docs.length === 1 ? "" : "s"}`
      : null,
    area.ideas.length > 0
      ? `${area.ideas.length} linked idea${area.ideas.length === 1 ? "" : "s"}`
      : null,
  ].filter((item): item is string => Boolean(item));

  const needs = [
    area.dueStandingTaskCount > 0
      ? `${area.dueStandingTaskCount} dated task${area.dueStandingTaskCount === 1 ? "" : "s"} in view`
      : null,
    pendingCaptureCount > 0
      ? `${pendingCaptureCount} capture${pendingCaptureCount === 1 ? "" : "s"} waiting`
      : null,
    reviewCount > 0
      ? `${reviewCount} review${reviewCount === 1 ? "" : "s"} ready`
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="grid gap-3 rounded-[18px] border border-[#E2E6DF] bg-white p-4 shadow-[0_2px_8px_rgba(28,25,23,0.04)] sm:grid-cols-[1fr_1.15fr] sm:p-5">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          At a glance
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          {facts.length > 0 ? facts.join(" · ") : "No active area records."}
        </p>
      </div>
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Heads up
        </h2>
        {needs.length > 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-stone-700">
            {needs.join(" · ")}
          </p>
        ) : area.latestNote ? (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-700">
            {area.latestNote.bodyMd}{" "}
            <span className="text-[#9AA096]">
              · {formatShortDate(area.latestNote.createdAt)}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            Nothing needs handling here.
          </p>
        )}
      </div>
    </section>
  );
}

type CaptureWithEdits = Capture & { textEdits: Array<{ text: string }> };
type ReviewRow = ScheduledReview & {
  capture: Pick<Capture, "id" | "rawText"> & {
    textEdits: Array<{ text: string }>;
  };
};
type CaptureReviewProposalRow = CaptureReviewProposal & {
  capture: Pick<Capture, "id" | "rawText"> & {
    textEdits: Array<{ text: string }>;
  };
  suggestedArea: (Area & { domain: Domain }) | null;
};

function effectiveCaptureText(
  capture: Pick<Capture, "rawText"> & { textEdits?: Array<{ text: string }> },
) {
  return capture.textEdits?.[0]?.text ?? capture.rawText;
}

function EditableCaptureText({
  capture,
}: {
  capture: Pick<Capture, "id" | "rawText"> & {
    textEdits?: Array<{ text: string }>;
  };
}) {
  const text = effectiveCaptureText(capture);
  return (
    <div>
      <p className="max-h-48 overflow-y-auto rounded-[10px] bg-[#F7F9F5] px-3 py-2.5 text-sm leading-relaxed text-stone-800">
        {text}
      </p>
      {capture.textEdits?.length ? (
        <p className="mt-1 text-xs text-[#B0ACA2]">
          Edited text. Original capture is still searchable.
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="inline-flex h-[30px] cursor-pointer list-none items-center rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
          Edit text
        </summary>
        <form action={updateCaptureText} className="mt-2 space-y-2">
          <input type="hidden" name="captureId" value={capture.id} />
          <textarea
            name="text"
            required
            rows={3}
            defaultValue={text}
            className="w-full rounded-[12px] border border-[#E2E6DF] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-700"
          />
          <button className="inline-flex h-[30px] items-center justify-center rounded-full bg-teal-700 px-3 text-[13px] font-medium text-white transition hover:bg-teal-800">
            Save text
          </button>
        </form>
      </details>
    </div>
  );
}

function NeedsReviewPanel({
  reviews,
  reviewProposals,
  domains,
}: {
  reviews: ReviewRow[];
  reviewProposals: CaptureReviewProposalRow[];
  domains: Array<Domain & { areas: Area[] }>;
}) {
  const total = reviews.length + reviewProposals.length;
  if (total === 0) {
    return null;
  }

  return (
    <section id="needs-review" className="scroll-mt-24 space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Needs review{" "}
        <span className="font-medium text-[#B0ACA2]">{total}</span>
      </h2>
      <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
        {reviewProposals.map((proposal) => {
          const suggestedType = isCaptureTargetType(proposal.suggestedType)
            ? proposal.suggestedType
            : null;
          const suggestedArea = proposal.suggestedArea;
          return (
            <div key={proposal.id} className="p-4">
              <EditableCaptureText capture={proposal.capture} />
              <div className="mt-2 rounded-[12px] bg-[#F2FAF7] px-3 py-2">
                <p className="text-[13px] font-medium text-stone-800">
                  Suggested:{" "}
                  {suggestedType ? targetLabel(suggestedType) : "Review"}{" "}
                  {suggestedArea ? (
                    <>
                      into {suggestedArea.domain.name} / {suggestedArea.name}
                    </>
                  ) : (
                    "into Inbox"
                  )}
                </p>
                {proposal.reason ? (
                  <p className="mt-1 text-xs leading-5 text-[#6B7268]">
                    {proposal.reason}
                  </p>
                ) : null}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <CaptureFileActions
                  captureId={proposal.captureId}
                  proposalId={proposal.id}
                  domains={domains}
                  label="File as..."
                  defaultType={suggestedType}
                  defaultAreaId={suggestedArea?.id ?? "area_inbox"}
                />
                <form action={snoozeCaptureReviewProposalOneDay}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button
                    type="submit"
                    className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
                  >
                    Snooze 1 day
                  </button>
                </form>
                <form action={dismissCaptureReviewProposal}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button
                    type="submit"
                    className="h-[30px] px-2 text-[13px] font-medium text-stone-500 transition hover:text-stone-950"
                  >
                    Dismiss
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        {reviews.map((review) => (
          <div key={review.id} className="p-4">
            <EditableCaptureText capture={review.capture} />
            <p className="mt-2 text-xs text-[#9AA096]">
              {review.reviewAt
                ? `Review date ${formatDateOnly(review.reviewAt)}`
                : `Waiting: ${review.conditionText}`}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <CaptureFileActions
                captureId={review.captureId}
                reviewId={review.id}
                domains={domains}
                label="File as..."
              />
              <form action={snoozeReviewOneDay}>
                <input type="hidden" name="reviewId" value={review.id} />
                <button
                  type="submit"
                  className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
                >
                  Snooze 1 day
                </button>
              </form>
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
                  title="Archive capture"
                  className="h-[30px] px-2 text-[13px] font-medium text-stone-500 transition hover:text-stone-950"
                >
                  Archive
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function isCaptureTargetType(value: string): value is "task" | "idea" | "note" | "reference" {
  return (
    value === "task" ||
    value === "idea" ||
    value === "note" ||
    value === "reference"
  );
}

function targetLabel(value: "task" | "idea" | "note" | "reference") {
  if (value === "task") return "Task";
  if (value === "idea") return "Idea";
  if (value === "note") return "Note";
  return "Reference";
}

function PendingCapturesPanel({
  captures,
  domains,
}: {
  captures: CaptureWithEdits[];
  domains: Array<Domain & { areas: Area[] }>;
}) {
  if (captures.length === 0) {
    return null;
  }

  return (
    <section id="pending-captures" className="scroll-mt-24 space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Pending captures{" "}
        <span className="font-medium text-[#B0ACA2]">{captures.length}</span>
      </h2>
      <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
        {captures.map((capture) => (
          <div key={capture.id} className="p-4">
            <EditableCaptureText capture={capture} />
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <CaptureFileActions
                captureId={capture.id}
                domains={domains}
                label="File as..."
              />
              <form action={dismissCapture}>
                <input type="hidden" name="captureId" value={capture.id} />
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
      reviewProposals,
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
                  status: "active",
                  OR: [{ parseStatus: "ambiguous" }, { parseStatus: "failed" }],
                  reviewProposals: {
                    none: {
                      status: { in: ["pending", "snoozed"] },
                    },
                  },
                },
                include: {
                  textEdits: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { text: true },
                  },
                },
                orderBy: { createdAt: "desc" },
                take: 20,
              })
            : Promise.resolve([]),
          area.id === "area_inbox"
            ? prisma.captureReviewProposal.findMany({
                where: {
                  OR: [
                    { status: "pending" },
                    { status: "snoozed", snoozedUntil: { lte: new Date() } },
                  ],
                },
                include: {
                  capture: {
                    select: {
                      id: true,
                      rawText: true,
                      textEdits: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { text: true },
                      },
                    },
                  },
                  suggestedArea: { include: { domain: true } },
                },
                orderBy: { createdAt: "asc" },
                take: 30,
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
                include: {
                  capture: {
                    select: {
                      id: true,
                      rawText: true,
                      textEdits: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { text: true },
                      },
                    },
                  },
                },
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
          [],
        ];

    const noteMentions =
      area && notes.length > 0
        ? await loadReferenceMentions(
            "entity_note",
            notes.map((note) => note.id),
          )
        : new Map();

    return {
      ok: true as const,
      area: area
        ? {
            ...area,
            notes: notes.map((note) => ({
              ...note,
              mentions: noteMentions.get(note.id) ?? [],
            })),
            docs,
            attachments,
            checkIns,
            dueStandingTaskCount: area.tasks.filter(
              (task) => task.dueDate && Number(task.dueDate) <= Number(today),
            ).length,
            importantNoteCount: notes.filter((note) => note.starredAt).length,
            latestNote: notes[0] ?? null,
            projects: area.projects.map((project) => ({
              ...project,
              latestCheckIn: latestProjectCheckIns.get(project.id) ?? null,
            })),
          }
        : null,
      pendingCaptures,
      reviewProposals,
      reviews,
      domains,
    };
  } catch {
    return { ok: false as const };
  }
}
