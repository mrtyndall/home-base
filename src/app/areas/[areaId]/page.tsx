import type { ReactNode } from "react";
import type { Capture } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Ellipsis, Plus } from "lucide-react";
import {
  dismissCaptureReviewProposal,
  parkAreaById,
  retireAreaById,
  snoozeCaptureReviewProposalOneDay,
  updateCaptureText,
  updateAreaParent,
  unparkAreaById,
} from "@/app/actions";
import { AreaPicker } from "@/components/area-picker";
import { InboxFilingControl } from "@/components/inbox-filing-control";
import { dismissReview, markReviewDone, snoozeReviewOneDay } from "@/app/review-actions";
import { CaptureFileActions } from "@/components/capture-file-actions";
import { CaptureDismissAction } from "@/components/capture-dismiss-action";
import { CheckInFeed } from "@/components/check-in-feed";
import { EntityDepth } from "@/components/entity-depth";
import { SetupNotice } from "@/components/setup-notice";
import { checkInSnippet, getLatestCheckIns } from "@/lib/checkins";
import {
  dateOnlyFromString,
  formatDateOnly,
  formatShortDate,
  localDateString,
} from "@/lib/dates";
import { prisma } from "@/lib/db";
import { loadReferenceMentions } from "@/lib/reference-mentions";
import { flattenAreaOptions } from "@/lib/hierarchy";
import { loadGlobalInboxPage } from "@/lib/global-inbox";

export const dynamic = "force-dynamic";

type AreaPageProps = {
  params: Promise<{ areaId: string }>;
  searchParams?: Promise<{ page?: string | string[] }>;
};

export default async function AreaPage({ params, searchParams }: AreaPageProps) {
  const { areaId } = await params;
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  if (areaId === "inbox") {
    const query = await searchParams;
    const rawPage = Array.isArray(query?.page) ? query.page[0] : query?.page;
    const page = Math.max(0, Number.parseInt(rawPage ?? "1", 10) - 1 || 0);
    const inbox = await loadGlobalInbox(page);
    if (!inbox.ok) return <SetupNotice reason="Database is not migrated or reachable." />;
    return <GlobalInbox data={inbox} />;
  }

  const result = await loadArea(areaId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.area) notFound();

  const area = result.area;
  const latestCheckIn = area.checkIns[0] ?? null;
  const areaPath = flattenAreaOptions(area.allAreas).find((option) => option.id === area.id)?.path ?? area.name;
  const areaBreadcrumb = buildAreaBreadcrumb(area.allAreas, area.id);
  const excludedAreaIds = collectDescendantAreaIds(area.allAreas, area.id);
  const childAreas = area.allAreas.filter((candidate) => candidate.parentAreaId === area.id);

  return (
    <div className="space-y-6">
      <header className="space-y-3 border-b border-[#DDE2DA] pb-5">
        <nav aria-label="Area path" className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-stone-500">
          <Link href="/projects" className="inline-flex h-11 items-center gap-2 rounded-sm font-medium transition hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
            <ArrowLeft size={15} /> Areas
          </Link>
          {areaBreadcrumb.map((crumb) => (
            <span key={crumb.id} className="inline-flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="text-[#B0B6AD]">/</span>
              <Link href={`/areas/${crumb.id}`} aria-current={crumb.id === area.id ? "page" : undefined} className="min-w-0 break-words rounded-sm py-2 [overflow-wrap:anywhere] transition hover:text-teal-700">{crumb.name}</Link>
            </span>
          ))}
        </nav>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096] [overflow-wrap:anywhere]">
              {areaPath}
            </p>
            <h1 className="mt-1.5 break-words font-serif text-[30px] font-medium leading-[1.15] tracking-[-0.015em] text-stone-950 [overflow-wrap:anywhere] lg:text-[36px]">
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
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href={`/projects/new?areaId=${area.id}`}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-teal-700 px-4 text-[13px] font-medium text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <Plus size={14} />
              New project
            </Link>
            <AreaOverflowMenu areaId={area.id} status={area.status} />
          </div>
        </div>
      </header>

      <details className="rounded-[14px] border border-[#E2E6DF] bg-white">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3.5 text-[13px] font-medium text-stone-600 [&::-webkit-details-marker]:hidden">
          Place in hierarchy <span className="text-[#9AA096]">{area.parentAreaId ? "Change" : "Add parent"}</span>
        </summary>
        <form action={updateAreaParent} className="space-y-3 border-t border-[#EEF1EC] p-3.5">
          <input type="hidden" name="areaId" value={area.id} />
          <AreaPicker
            areas={area.allAreas}
            name="parentAreaId"
            label="Parent area"
            defaultAreaId={area.parentAreaId}
            excludedAreaIds={excludedAreaIds}
          />
          <div className="flex justify-end">
            <button type="submit" className="h-11 rounded-full bg-teal-700 px-5 text-sm font-medium text-white transition hover:bg-teal-800">Save place</button>
          </div>
        </form>
      </details>

      <CheckInFeed parentType="area" parentId={area.id} checkIns={area.checkIns} />
      <AreaHubOverview area={area} />
      {childAreas.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Subareas
          </h2>
          <div className="divide-y divide-[#EEF1EC] overflow-hidden rounded-[14px] border border-[#E2E6DF] bg-white">
            {childAreas.map((child) => (
              <Link
                key={child.id}
                href={`/areas/${child.id}`}
                className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#F7F9F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700"
              >
                <span className="min-w-0 break-words text-sm font-medium text-stone-900 [overflow-wrap:anywhere]">
                  {child.name}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-stone-500">
                  View area <ChevronRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <EntityDepth
        parentType="area"
        parentId={area.id}
        notes={area.notes}
        docs={area.docs}
        attachments={area.attachments}
        variant="project"
      />

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr]">
        <div className="space-y-6">
          <Panel title="Projects in this area">
            {area.projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="block px-4 py-3 transition hover:bg-[#F7F9F5]">
                <p className="text-sm font-medium text-stone-800">{project.name}</p>
                {project.latestCheckIn ? (
                  <p className="mt-0.5 text-xs text-[#9AA096]">
                    {checkInSnippet(project.latestCheckIn.bodyMd, 100)} · {formatShortDate(project.latestCheckIn.createdAt)}
                  </p>
                ) : null}
              </Link>
            ))}
          </Panel>
          <Panel title="Linked ideas">
            {area.ideas.map((idea) => (
              <Link key={idea.id} href="/ideas" className="block px-4 py-3 text-sm font-medium text-stone-900 transition hover:bg-[#F7F9F5]">
                {idea.title}
              </Link>
            ))}
          </Panel>
        </div>
        <Panel title="Standing tasks">
          {area.tasks.map((task) => (
            <Link key={task.id} href={`/tasks/${task.id}`} className="block px-4 py-3 text-sm font-medium text-stone-900 transition hover:bg-[#F7F9F5]">
              {task.title}
              {task.dueDate ? <span className="ml-2 text-xs font-normal text-[#9AA096]">{formatDateOnly(task.dueDate)}</span> : null}
            </Link>
          ))}
        </Panel>
      </section>
    </div>
  );
}

type GlobalInboxData = Extract<Awaited<ReturnType<typeof loadGlobalInbox>>, { ok: true }>;

function GlobalInbox({ data }: { data: GlobalInboxData }) {
  const total = data.totalCount;
  const activeAreas = data.areas.filter((area) => area.status === "active");
  const selectableAreaIds = activeAreas.map((area) => area.id);
  const destinationProjects = Array.from(
    new Map(
      [
        ...data.destinationProjects,
        ...data.reviewProposals.flatMap((proposal) =>
          proposal.suggestedProject ? [proposal.suggestedProject] : [],
        ),
      ].map((project) => [
        project.id,
        { id: project.id, name: project.name, areaId: project.areaId },
      ]),
    ).values(),
  );
  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-[#DDE2DA] pb-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"><ArrowLeft size={15} />Home</Link>
        <h1 className="font-serif text-[32px] font-medium tracking-[-0.015em] text-stone-950">Inbox</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[#6B7268]">Things saved without an Area, gathered here until their natural home is clear.</p>
      </header>
      {total === 0 ? (
        <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-6"><h2 className="font-serif text-xl text-stone-950">Inbox is clear</h2><p className="mt-1 text-sm text-[#6B7268]">Everything has a home for now.</p></section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {data.reviewProposals.length || data.reviews.length ? (
            <InboxPanel title="Needs review" count={data.reviewProposals.length + data.reviews.length} id="needs-review">
              {data.reviewProposals.map((proposal) => (
                <div key={proposal.id} className="space-y-2 p-4">
                  <EditableCaptureText capture={proposal.capture} />
                  <p className="rounded-[10px] bg-[#F2FAF7] px-3 py-2 text-[13px] text-stone-700">
                    Suggested: {proposal.suggestedType ?? "Review"}
                    {proposal.suggestedProject
                      ? ` into ${proposal.suggestedProject.name}`
                      : proposal.suggestedArea
                        ? ` into ${proposal.suggestedArea.name}`
                        : " in Global / Inbox"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <CaptureFileActions
                      captureId={proposal.captureId}
                      proposalId={proposal.id}
                      areas={activeAreas}
                      projects={destinationProjects}
                      label="File as…"
                      defaultAreaId={proposal.suggestedArea?.id ?? ""}
                      defaultProjectId={proposal.suggestedProject?.id ?? ""}
                      defaultType={proposal.suggestedType}
                    />
                    <form action={snoozeCaptureReviewProposalOneDay}><input type="hidden" name="proposalId" value={proposal.id} /><SmallAction>Snooze 1 day</SmallAction></form>
                    <form action={dismissCaptureReviewProposal}><input type="hidden" name="proposalId" value={proposal.id} /><SmallAction>Dismiss</SmallAction></form>
                  </div>
                </div>
              ))}
              {data.reviews.map((review) => (
                <div key={review.id} className="space-y-2 p-4">
                  <EditableCaptureText capture={review.capture} />
                  <div className="flex flex-wrap gap-1.5">
                    <CaptureFileActions captureId={review.captureId} reviewId={review.id} areas={activeAreas} projects={destinationProjects} label="File as…" />
                    <form action={snoozeReviewOneDay}><input type="hidden" name="reviewId" value={review.id} /><SmallAction>Snooze 1 day</SmallAction></form>
                    <form action={markReviewDone}><input type="hidden" name="reviewId" value={review.id} /><SmallAction>Done</SmallAction></form>
                    <form action={dismissReview} aria-label="Archive capture"><input type="hidden" name="reviewId" value={review.id} /><SmallAction>Archive</SmallAction></form>
                  </div>
                </div>
              ))}
            </InboxPanel>
          ) : null}
          {data.pendingCaptures.length ? (
            <InboxPanel title="Pending captures" count={data.pendingCaptures.length} id="pending-captures">
              {data.pendingCaptures.map((capture) => (
                <div key={capture.id} className="space-y-2 p-4">
                  <EditableCaptureText capture={capture} />
                  <div className="flex flex-wrap gap-1.5">
                    <CaptureFileActions captureId={capture.id} areas={activeAreas} projects={destinationProjects} label="File as…" />
                    <CaptureDismissAction captureId={capture.id} />
                  </div>
                </div>
              ))}
            </InboxPanel>
          ) : null}
          {data.projects.length ? <ProjectInboxGroup projects={data.projects} areas={data.areas} selectableAreaIds={selectableAreaIds} /> : null}
          {data.routines.length ? <RoutineInboxGroup routines={data.routines} areas={data.areas} selectableAreaIds={selectableAreaIds} /> : null}
          {data.tasks.length ? <SimpleInboxGroup title="Tasks" items={data.tasks.map((item) => ({ id: item.id, label: item.title, href: `/tasks/${item.id}` }))} /> : null}
          {data.ideas.length ? <SimpleInboxGroup title="Ideas" items={data.ideas.map((item) => ({ id: item.id, label: item.title, href: `/ideas#idea-${item.id}` }))} /> : null}
          {data.references.length ? <SimpleInboxGroup title="References" items={data.references.map((item) => ({ id: item.id, label: item.title ?? item.body, href: `/references/${item.id}` }))} /> : null}
          {data.entityDocs.length ? <SimpleInboxGroup title="Docs" items={data.entityDocs.map((item) => ({ id: item.id, label: item.title, href: `/areas/inbox#doc-${item.id}`, anchorId: `doc-${item.id}` }))} /> : null}
          {data.documents.length ? <SimpleInboxGroup title="Files" items={data.documents.map((item) => ({ id: item.id, label: item.filename, href: `/api/documents/${item.id}/download` }))} /> : null}
          {data.notes.length ? (
            <InboxPanel title="Notes" count={data.notes.length}>{data.notes.map((note) => <p key={note.id} className="line-clamp-3 p-4 text-sm leading-relaxed text-stone-700">{note.bodyMd}</p>)}</InboxPanel>
          ) : null}
        </div>
      )}
      {data.hasPreviousPage || data.hasNextPage ? (
        <nav aria-label="Inbox pages" className="flex items-center justify-between gap-3 border-t border-[#DDE2DA] pt-4">
          {data.hasPreviousPage ? (
            <Link href={`/areas/inbox?page=${data.page}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#D8DDD5] bg-white px-4 text-sm font-medium text-stone-700 hover:text-teal-700"><ChevronLeft size={15} /> Previous</Link>
          ) : <span />}
          <span className="text-xs font-medium text-stone-500">Page {data.page + 1}</span>
          {data.hasNextPage ? (
            <Link href={`/areas/inbox?page=${data.page + 2}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">More <ChevronRight size={15} /></Link>
          ) : <span />}
        </nav>
      ) : null}
    </div>
  );
}

function ProjectInboxGroup({
  projects,
  areas,
  selectableAreaIds,
}: {
  projects: GlobalInboxData["projects"];
  areas: GlobalInboxData["areas"];
  selectableAreaIds: string[];
}) {
  return (
    <InboxPanel title="Projects" count={projects.length}>
      {projects.map((project) => (
        <article key={project.id} className="p-3.5">
          <Link
            href={`/projects/${project.id}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-[10px] px-1 transition hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <span className="min-w-0 break-words text-sm font-medium text-stone-900 [overflow-wrap:anywhere]">{project.name}</span>
            <span className="shrink-0 rounded-full bg-[#F2F5F0] px-2 py-1 text-[11px] font-medium capitalize text-stone-500">{project.status}</span>
          </Link>
          <InboxFilingControl entityType="project" entityId={project.id} areas={areas} selectableAreaIds={selectableAreaIds} />
        </article>
      ))}
    </InboxPanel>
  );
}

function RoutineInboxGroup({
  routines,
  areas,
  selectableAreaIds,
}: {
  routines: GlobalInboxData["routines"];
  areas: GlobalInboxData["areas"];
  selectableAreaIds: string[];
}) {
  return (
    <InboxPanel title="Routines" count={routines.length}>
      {routines.map((routine) => (
        <article key={routine.id} className="p-3.5">
          <Link href={`/tasks#routine-${routine.id}`} className="flex min-h-11 items-center rounded-[10px] px-1 text-sm font-medium text-stone-900 transition hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
            <span className="break-words [overflow-wrap:anywhere]">{routine.name}</span>
          </Link>
          <InboxFilingControl entityType="routine" entityId={routine.id} areas={areas} selectableAreaIds={selectableAreaIds} />
        </article>
      ))}
    </InboxPanel>
  );
}

function InboxPanel({ title, count, id, children }: { title: string; count: number; id?: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-24 space-y-2.5"><h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">{title} <span className="font-medium text-[#B0ACA2]">{count}</span></h2><div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">{children}</div></section>;
}

function SimpleInboxGroup({ title, items }: { title: string; items: Array<{ id: string; label: string; href: string; anchorId?: string }> }) {
  return <InboxPanel title={title} count={items.length}>{items.map((item) => <Link key={item.id} id={item.anchorId} href={item.href} className="block scroll-mt-24 truncate px-4 py-3 text-sm font-medium text-stone-900 transition hover:bg-[#F7F9F5] hover:text-teal-700">{item.label}</Link>)}</InboxPanel>;
}

function SmallAction({ children }: { children: ReactNode }) {
  return <button type="submit" className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700">{children}</button>;
}

function EditableCaptureText({ capture }: { capture: Pick<Capture, "id" | "rawText"> & { textEdits: Array<{ text: string }> } }) {
  const text = capture.textEdits[0]?.text ?? capture.rawText;
  return <div><Link href={`/captures/${capture.id}`} className="block whitespace-pre-wrap text-sm leading-relaxed text-stone-800 hover:text-teal-700">{text}</Link><details className="mt-2"><summary className="cursor-pointer list-none text-[13px] font-medium text-stone-500 hover:text-teal-700 [&::-webkit-details-marker]:hidden">Edit text</summary><form action={updateCaptureText} className="mt-2 space-y-2"><input type="hidden" name="captureId" value={capture.id} /><textarea name="text" required rows={3} defaultValue={text} className="w-full rounded-[12px] border border-[#E2E6DF] px-3 py-2 text-sm outline-none focus:border-teal-700" /><button className="h-[30px] rounded-full bg-teal-700 px-3 text-[13px] font-medium text-white">Save text</button></form></details></div>;
}

type LoadedArea = NonNullable<Extract<Awaited<ReturnType<typeof loadArea>>, { ok: true }>["area"]>;

function AreaHubOverview({ area }: { area: LoadedArea }) {
  const facts = [
    `${area.tasks.length} standing task${area.tasks.length === 1 ? "" : "s"}`,
    `${area.projects.length} project${area.projects.length === 1 ? "" : "s"}`,
    area.importantNoteCount ? `${area.importantNoteCount} important note${area.importantNoteCount === 1 ? "" : "s"}` : null,
    area.docs.length ? `${area.docs.length} doc${area.docs.length === 1 ? "" : "s"}` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="grid gap-3 rounded-[18px] border border-[#E2E6DF] bg-white p-4 shadow-[0_2px_8px_rgba(28,25,23,0.04)] sm:grid-cols-[1fr_1.15fr] sm:p-5">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">At a glance</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">{facts.length ? facts.join(" · ") : "A quiet area, ready to be tended."}</p>
      </div>
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">Current state</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          {area.currentState ?? (area.dueStandingTaskCount ? `${area.dueStandingTaskCount} dated task${area.dueStandingTaskCount === 1 ? "" : "s"} in view.` : "Nothing needs handling here.")}
        </p>
      </div>
    </section>
  );
}

function AreaOverflowMenu({ areaId, status }: { areaId: string; status: "active" | "parked" | "retired" }) {
  if (status === "retired") return null;
  return (
    <details className="relative">
      <summary title="Area actions" className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full text-stone-500 transition hover:bg-white hover:text-stone-950 [&::-webkit-details-marker]:hidden">
        <Ellipsis size={17} />
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-40 rounded-[18px] border border-white/65 bg-[#FAFBF9]/80 p-1.5 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150">
        {status === "active" ? <><AreaMenuAction action={parkAreaById.bind(null, areaId)} label="Park" /><AreaMenuAction action={retireAreaById.bind(null, areaId)} label="Retire" /></> : null}
        {status === "parked" ? <AreaMenuAction action={unparkAreaById.bind(null, areaId)} label="Unpark" /> : null}
      </div>
    </details>
  );
}

function AreaMenuAction({ action, label }: { action: () => Promise<void>; label: string }) {
  return <form action={action}><button type="submit" className="flex h-10 w-full items-center rounded-[10px] px-2.5 text-left text-sm text-stone-700 transition hover:bg-white/85 hover:text-stone-950">{label}</button></form>;
}

function Panel({ title, children }: { title: string; children: ReactNode[] }) {
  return (
    <div className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">{title}{children.length ? <span className="ml-1 font-medium text-[#B0ACA2]">{children.length}</span> : null}</h2>
      {children.length ? <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">{children}</div> : <p className="text-sm text-[#9AA096]">None yet.</p>}
    </div>
  );
}

async function loadGlobalInbox(page = 0) {
  try {
    return { ok: true as const, ...await loadGlobalInboxPage(page) };
  } catch {
    return { ok: false as const };
  }
}

async function loadArea(areaId: string) {
  try {
    const area = await prisma.area.findUnique({
      where: { id: areaId },
      include: {
        tasks: { where: { status: "open", projectId: null }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 20 },
        projects: { where: { status: { in: ["active", "someday", "parked"] } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 20 },
        ideas: { where: { status: { in: ["seed", "developing"] } }, orderBy: { updatedAt: "desc" }, take: 12 },
      },
    });
    if (!area) return { ok: true as const, area: null };

    const today = dateOnlyFromString(localDateString());
    const [notes, docs, attachments, checkIns, latestProjectCheckIns, allAreas] = await Promise.all([
      prisma.entityNote.findMany({ where: { parentType: "area", parentId: area.id }, orderBy: { createdAt: "desc" }, take: 80 }),
      prisma.entityDoc.findMany({ where: { parentType: "area", parentId: area.id, status: "active" }, orderBy: { updatedAt: "desc" }, take: 12 }),
      prisma.document.findMany({ where: { parentType: "area", parentId: area.id }, orderBy: { createdAt: "desc" }, take: 12 }),
      prisma.checkIn.findMany({ where: { parentType: "area", parentId: area.id }, orderBy: { createdAt: "desc" }, take: 15 }),
      getLatestCheckIns("project", area.projects.map((project) => project.id)),
      prisma.area.findMany({
        where: { status: "active", isSystem: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);
    const mentions = notes.length ? await loadReferenceMentions("entity_note", notes.map((note) => note.id)) : new Map();

    return {
      ok: true as const,
      area: {
        ...area,
        notes: notes.map((note) => ({ ...note, mentions: mentions.get(note.id) ?? [] })),
        docs,
        attachments,
        checkIns,
        allAreas,
        dueStandingTaskCount: area.tasks.filter((task) => task.dueDate && Number(task.dueDate) <= Number(today)).length,
        importantNoteCount: notes.filter((note) => note.starredAt).length,
        projects: area.projects.map((project) => ({ ...project, latestCheckIn: latestProjectCheckIns.get(project.id) ?? null })),
      },
    };
  } catch {
    return { ok: false as const, area: null };
  }
}

function buildAreaBreadcrumb(
  areas: Array<{ id: string; name: string; parentAreaId: string | null }>,
  areaId: string,
) {
  const byId = new Map(areas.map((area) => [area.id, area]));
  const breadcrumb: Array<{ id: string; name: string }> = [];
  const visited = new Set<string>();
  let current = byId.get(areaId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    breadcrumb.unshift({ id: current.id, name: current.name });
    current = current.parentAreaId ? byId.get(current.parentAreaId) : undefined;
  }
  return breadcrumb;
}

function collectDescendantAreaIds(
  areas: Array<{ id: string; parentAreaId: string | null }>,
  areaId: string,
) {
  const excluded = new Set([areaId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const area of areas) {
      if (area.parentAreaId && excluded.has(area.parentAreaId) && !excluded.has(area.id)) {
        excluded.add(area.id);
        changed = true;
      }
    }
  }
  return [...excluded];
}
