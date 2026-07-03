import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDaysToDateString, localDateString } from "@/lib/dates";
import { isPushoverConfigured, sendPushoverMessage } from "@/lib/pushover";

export type PersonActor = {
  source: "manual" | "capture" | "api";
  label?: string;
};

export async function findPersonByMatch(personMatch: string) {
  return prisma.person.findFirst({
    where: {
      status: "active",
      name: { contains: personMatch, mode: "insensitive" },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createPersonRecord(
  input: {
    name: string;
    relationshipType?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    notesMd?: string | null;
    areaId?: string | null;
  },
  actor: PersonActor,
) {
  const person = await prisma.person.create({
    data: {
      name: input.name,
      relationshipType: input.relationshipType ?? undefined,
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      company: input.company ?? undefined,
      notesMd: input.notesMd ?? undefined,
      areaId: input.areaId ?? undefined,
    },
  });

  await prisma.notification.create({
    data: {
      type: "person_created",
      title: "Person added",
      body: person.name,
      sourceRef: {
        type: "person",
        id: person.id,
        source: actor.source,
        actor: actor.label ?? null,
      },
    },
  });

  return person;
}

/**
 * Log interactions for synced calendar events whose attendees match known
 * people by email. Idempotent: one interaction per person per event.
 */
export async function logCalendarInteractions(options?: {
  windowDays?: number;
}) {
  const windowDays = options?.windowDays ?? 30;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const people = await prisma.person.findMany({
    where: { status: "active", email: { not: null } },
    select: { id: true, name: true, email: true },
  });
  if (people.length === 0) {
    return 0;
  }
  const peopleByEmail = new Map(
    people.map((person) => [person.email!.toLowerCase(), person]),
  );

  const events = await prisma.calendarEvent.findMany({
    where: {
      attendees: { not: Prisma.JsonNull },
      start: { gte: windowStart, lte: now },
      status: { not: "cancelled" },
    },
    select: { id: true, title: true, start: true, attendees: true },
  });

  let logged = 0;
  for (const event of events) {
    if (!Array.isArray(event.attendees)) continue;
    for (const attendee of event.attendees) {
      const email =
        typeof attendee === "object" &&
        attendee !== null &&
        "email" in attendee &&
        typeof attendee.email === "string"
          ? attendee.email.toLowerCase()
          : null;
      if (!email) continue;
      const person = peopleByEmail.get(email);
      if (!person) continue;

      const existing = await prisma.personInteraction.findFirst({
        where: { personId: person.id, calendarEventId: event.id },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.personInteraction.create({
        data: {
          personId: person.id,
          interactionType: "calendar_event",
          notesMd: event.title,
          occurredAt: event.start,
          source: "calendar",
          calendarEventId: event.id,
        },
      });
      await prisma.notification.create({
        data: {
          type: "interaction_logged",
          title: "Interaction logged",
          body: `${person.name} — ${event.title}`,
          sourceRef: {
            type: "person_interaction",
            personId: person.id,
            calendarEventId: event.id,
            source: "calendar",
          },
        },
      });
      logged += 1;
    }
  }

  return logged;
}

const FACT_NUDGE_LEAD_DAYS = 14;

/**
 * Surface person facts whose relevant date is inside the lead window
 * through the existing time-sensitive nudge trigger. Recurring facts
 * match on month/day each year. One nudge per fact per occurrence-year.
 */
export async function nudgeUpcomingPersonFacts() {
  const todayStr = localDateString();
  const horizonStr = addDaysToDateString(todayStr, FACT_NUDGE_LEAD_DAYS);
  const currentYear = Number(todayStr.slice(0, 4));

  const facts = await prisma.personFact.findMany({
    where: { dateRelevant: { not: null } },
    include: { person: { select: { id: true, name: true, status: true } } },
  });

  let written = 0;
  let delivered = 0;
  for (const fact of facts) {
    if (fact.person.status !== "active") continue;
    const dateStr = fact.dateRelevant!.toISOString().slice(0, 10);

    let occurrence: string | null = null;
    if (fact.recurring) {
      const monthDay = dateStr.slice(5);
      const thisYear = `${currentYear}-${monthDay}`;
      const nextYear = `${currentYear + 1}-${monthDay}`;
      if (thisYear >= todayStr && thisYear <= horizonStr) {
        occurrence = thisYear;
      } else if (nextYear >= todayStr && nextYear <= horizonStr) {
        occurrence = nextYear;
      }
    } else if (dateStr >= todayStr && dateStr <= horizonStr) {
      occurrence = dateStr;
    }
    if (!occurrence) continue;

    const alreadyNudged = await prisma.nudge.findFirst({
      where: {
        trigger: "time_sensitive",
        AND: [
          { supportingData: { path: ["personFactId"], equals: fact.id } },
          { supportingData: { path: ["occurrence"], equals: occurrence } },
        ],
      },
      select: { id: true },
    });
    if (alreadyNudged) continue;

    const body = `${fact.person.name}: ${fact.factValue} (${occurrence})`;
    await prisma.notification.create({
      data: {
        type: "person_fact_upcoming",
        title: "Coming up",
        body,
        sourceRef: {
          type: "person_fact",
          id: fact.id,
          personId: fact.person.id,
          occurrence,
          source: "scheduler",
        },
      },
    });

    let pushDelivered = false;
    if (isPushoverConfigured()) {
      const result = await sendPushoverMessage("Coming up", body);
      pushDelivered = result.ok;
    }

    // The nudge row is both the push audit and the once-per-occurrence
    // dedup record; `delivered` keeps it honest when Pushover is absent.
    await prisma.nudge.create({
      data: {
        trigger: "time_sensitive",
        title: "Coming up",
        body,
        sentAt: new Date(),
        supportingData: {
          personFactId: fact.id,
          occurrence,
          delivered: pushDelivered,
        },
      },
    });
    written += 1;
    if (pushDelivered) {
      delivered += 1;
    }
  }

  return { written, delivered };
}
