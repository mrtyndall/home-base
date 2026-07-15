import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { CaptureStatus } from "@prisma/client";
import { CaptureFileActions } from "@/components/capture-file-actions";
import { SetupNotice } from "@/components/setup-notice";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type CapturePageProps = {
  params: Promise<{ captureId: string }>;
};

type CreatedItem = {
  type: string;
  id: string;
  label: string;
};

export default async function CapturePage({ params }: CapturePageProps) {
  const { captureId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const [capture, areas, projects] = await Promise.all([
    prisma.capture.findUnique({
      where: { id: captureId },
      include: {
        textEdits: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { text: true, createdAt: true },
        },
      },
    }),
    prisma.area.findMany({
      where: { status: "active", isSystem: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.project.findMany({
      where: { status: { in: ["active", "parked", "someday"] } },
      select: { id: true, name: true, areaId: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  if (!capture) {
    notFound();
  }

  const effectiveText = capture.textEdits[0]?.text ?? capture.rawText;
  const createdItems = normalizeCreatedItems(capture.createdItems);
  const visibleItems = createdItems.filter((item) => item.type !== "notification");
  const pending = isPendingCapture(capture.status, capture.parseStatus, createdItems);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-3">
        <Link
          href="/areas/inbox"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          Inbox
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Capture
          </p>
          <h1 className="mt-1.5 font-serif text-[28px] font-medium leading-[1.18] tracking-[-0.01em] text-stone-950">
            {headline(effectiveText)}
          </h1>
          <p className="mt-2 text-sm text-[#6B7268]">
            {formatDateTime(capture.createdAt)} · {capture.source.replaceAll("_", " ")}
          </p>
        </div>
      </header>

      <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-4 shadow-[0_2px_8px_rgba(28,25,23,0.04)]">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Raw capture
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-stone-800">
          {effectiveText}
        </p>
        {capture.textEdits.length > 0 ? (
          <p className="mt-3 text-xs text-[#9AA096]">
            Edited text shown. The original raw capture is still preserved and searchable.
          </p>
        ) : null}
      </section>

      {pending ? (
        <section className="rounded-[18px] border border-teal-700/25 bg-[#F2FAF7] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-950">
                This still needs a home
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#6B7268]">
                Choose the type and destination, then confirm before it is filed.
              </p>
            </div>
            <CaptureFileActions
              captureId={capture.id}
              areas={areas}
              projects={projects}
              align="right"
              label="File as..."
            />
          </div>
        </section>
      ) : null}

      {visibleItems.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Filed as
          </h2>
          <div className="divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white">
            {visibleItems.map((item) => {
              const href = itemHref(item);
              const row = (
                <>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-950">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs capitalize text-[#9AA096]">
                      {item.type.replaceAll("_", " ")}
                    </p>
                  </div>
                  {href ? (
                    <ArrowRight size={14} className="text-[#9AA096]" />
                  ) : null}
                </>
              );
              return href ? (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={href}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#F7F9F5]"
                >
                  {row}
                </Link>
              ) : (
                <div
                  key={`${item.type}-${item.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  {row}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <details className="rounded-[14px] border border-[#E2E6DF] bg-white p-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-stone-700 [&::-webkit-details-marker]:hidden">
          Parser details
        </summary>
        <dl className="mt-3 divide-y divide-[#EEF1EC] text-sm">
          <DetailRow label="Status" value={capture.status} />
          <DetailRow label="Parse status" value={capture.parseStatus ?? "not parsed"} />
        </dl>
      </details>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        {label}
      </dt>
      <dd className="text-stone-800">{value}</dd>
    </div>
  );
}

function normalizeCreatedItems(value: unknown): CreatedItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CreatedItem => {
    return (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      typeof item.type === "string" &&
      "id" in item &&
      typeof item.id === "string" &&
      "label" in item &&
      typeof item.label === "string"
    );
  });
}

function isPendingCapture(
  status: CaptureStatus,
  parseStatus: string | null,
  items: CreatedItem[],
) {
  if (status === "dismissed") return false;
  if (parseStatus === "ambiguous" || parseStatus === "failed") return true;
  return items.some((item) => item.type === "pending_capture");
}

function itemHref(item: CreatedItem) {
  if (item.type === "task") return `/tasks/${item.id}`;
  if (item.type === "project") return `/projects/${item.id}`;
  if (item.type === "area") return `/areas/${item.id}`;
  if (item.type === "entity_note") return `/notes/${item.id}`;
  if (item.type === "reference") return `/references/${item.id}`;
  if (item.type === "check_in") return `/check-ins/${item.id}`;
  if (item.type === "calendar_event") return `/calendar-events/${item.id}`;
  if (item.type === "person") return `/people/${item.id}`;
  if (item.type === "journal_entry") return "/ideas";
  if (item.type === "idea" || item.type === "idea_note") return "/ideas";
  if (item.type === "pending_capture") return "/areas/inbox";
  return null;
}

function headline(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}...`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
}
