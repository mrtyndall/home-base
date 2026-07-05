import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { updatePersonInteraction } from "@/app/actions";
import { SetupNotice } from "@/components/setup-notice";
import { MentionTextarea } from "@/components/mention-textarea";
import { formatDateOnly, formatShortDate } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PersonInteractionPageProps = {
  params: Promise<{ personId: string; interactionId: string }>;
};

export default async function PersonInteractionPage({
  params,
}: PersonInteractionPageProps) {
  const { personId, interactionId } = await params;

  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadPersonInteraction(personId, interactionId);
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }
  if (!result.interaction) {
    notFound();
  }

  const { interaction, meeting } = result;
  const occurredOn = interaction.occurredAt.toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-3">
        <Link
          href={`/people/${interaction.person.id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950"
        >
          <ArrowLeft size={15} />
          {interaction.person.name}
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Interaction
          </p>
          <h1 className="mt-1.5 font-serif text-[26px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-950">
            {interaction.notesMd ?? interaction.interactionType}
          </h1>
          <p className="mt-2 text-sm text-[#9AA096]">
            {[
              formatDateOnly(interaction.occurredAt),
              interaction.source === "calendar"
                ? "from calendar"
                : interaction.source === "capture"
                  ? "from capture"
                  : "noted by hand",
              interaction.interactionType,
            ].join(" · ")}
          </p>
        </div>
      </header>

      <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Edit interaction
        </h2>
        <form action={updatePersonInteraction} className="mt-4 grid gap-3">
          <input type="hidden" name="personId" value={interaction.personId} />
          <input type="hidden" name="interactionId" value={interaction.id} />
          <label className="grid gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-[#9AA096]">
            Notes
            <MentionTextarea
              name="notesMd"
              rows={5}
              defaultValue={interaction.notesMd ?? ""}
              className="rounded-[12px] border border-[#E2E6DF] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-950 outline-none focus:border-teal-700"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-[#9AA096]">
              Type
              <input
                name="interactionType"
                defaultValue={interaction.interactionType}
                className="h-10 rounded-[12px] border border-[#E2E6DF] bg-white px-3 text-sm font-normal normal-case tracking-normal text-stone-950 outline-none focus:border-teal-700"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-[#9AA096]">
              Date
              <input
                name="occurredOn"
                type="date"
                defaultValue={occurredOn}
                className="h-10 rounded-[12px] border border-[#E2E6DF] bg-white px-3 text-sm font-normal normal-case tracking-normal text-stone-950 outline-none focus:border-teal-700"
              />
            </label>
          </div>
          <button className="h-10 rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800 sm:w-fit">
            Save interaction
          </button>
        </form>
      </section>

      {meeting ? (
        <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Linked meeting
          </h2>
          <Link
            href={`/calendar-events/${meeting.id}`}
            className="mt-2 block rounded-[12px] bg-[#F7F9F5] px-3 py-2 transition hover:bg-[#EEF1EC]"
          >
            <p className="text-sm font-medium text-stone-950">
              {meeting.title}
            </p>
            <p className="mt-0.5 text-xs text-[#9AA096]">
              {formatShortDate(meeting.start)}
            </p>
          </Link>
        </section>
      ) : null}

      {interaction.capture ? (
        <section className="rounded-[18px] border border-[#E2E6DF] bg-white p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Original capture
          </h2>
          <p className="mt-2 rounded-[12px] bg-[#F7F9F5] px-3 py-2 text-sm leading-relaxed text-stone-800">
            {interaction.capture.rawText}
          </p>
          <p className="mt-2 text-xs text-[#B0ACA2]">
            {formatShortDate(interaction.capture.createdAt)}
          </p>
        </section>
      ) : null}
    </div>
  );
}

async function loadPersonInteraction(personId: string, interactionId: string) {
  try {
    const interaction = await prisma.personInteraction.findFirst({
      where: { id: interactionId, personId },
      include: {
        person: { select: { id: true, name: true } },
        capture: { select: { rawText: true, createdAt: true } },
      },
    });

    const meeting = interaction?.calendarEventId
      ? await prisma.calendarEvent.findUnique({
          where: { id: interaction.calendarEventId },
          select: { id: true, title: true, start: true },
        })
      : null;

    return { ok: true as const, interaction, meeting };
  } catch {
    return { ok: false as const };
  }
}
