import { prisma } from "@/lib/db";

export type ReferenceMentionTarget = {
  label: string;
  targetType: "person" | "reference" | "calendar_event";
  targetId: string;
  href: string;
};

type SourceType =
  | "entity_note"
  | "check_in"
  | "reference"
  | "journal_entry"
  | "calendar_event"
  | "person_interaction";

export async function syncReferenceMentions(
  sourceType: SourceType,
  sourceId: string,
  text: string,
) {
  await prisma.referenceMention.updateMany({
    where: { sourceType, sourceId, status: "active" },
    data: { status: "inactive" },
  });

  const targets = await resolveReferenceMentions(text);
  for (const target of targets) {
    await prisma.referenceMention.upsert({
      where: {
        sourceType_sourceId_targetType_targetId: {
          sourceType,
          sourceId,
          targetType: target.targetType,
          targetId: target.targetId,
        },
      },
      update: { label: target.label, status: "active" },
      create: {
        sourceType,
        sourceId,
        targetType: target.targetType,
        targetId: target.targetId,
        label: target.label,
      },
    });
  }
}

export async function loadReferenceMentions(
  sourceType: SourceType,
  sourceIds: string[],
) {
  if (sourceIds.length === 0) {
    return new Map<string, ReferenceMentionTarget[]>();
  }

  const mentions = await prisma.referenceMention.findMany({
    where: { sourceType, sourceId: { in: sourceIds }, status: "active" },
    orderBy: { label: "asc" },
  });

  const peopleById = new Map(
    (
      await prisma.person.findMany({
        where: {
          id: {
            in: mentions
              .filter((mention) => mention.targetType === "person")
              .map((mention) => mention.targetId),
          },
        },
        select: { id: true, name: true },
      })
    ).map((person) => [person.id, person.name]),
  );
  const referencesById = new Map(
    (
      await prisma.reference.findMany({
        where: {
          id: {
            in: mentions
              .filter((mention) => mention.targetType === "reference")
              .map((mention) => mention.targetId),
          },
        },
        select: { id: true, title: true, body: true },
      })
    ).map((reference) => [
      reference.id,
      reference.title ?? reference.body.slice(0, 80),
    ]),
  );
  const calendarEventsById = new Map(
    (
      await prisma.calendarEvent.findMany({
        where: {
          id: {
            in: mentions
              .filter((mention) => mention.targetType === "calendar_event")
              .map((mention) => mention.targetId),
          },
        },
        select: { id: true, title: true },
      })
    ).map((event) => [event.id, event.title]),
  );

  const grouped = new Map<string, ReferenceMentionTarget[]>();
  for (const mention of mentions) {
    const list = grouped.get(mention.sourceId) ?? [];
    list.push({
      label:
        mention.targetType === "person"
          ? (peopleById.get(mention.targetId) ?? mention.label)
          : mention.targetType === "calendar_event"
            ? (calendarEventsById.get(mention.targetId) ?? mention.label)
            : (referencesById.get(mention.targetId) ?? mention.label),
      targetType:
        mention.targetType === "person"
          ? "person"
          : mention.targetType === "calendar_event"
            ? "calendar_event"
            : "reference",
      targetId: mention.targetId,
      href: hrefForMentionTarget(mention.targetType, mention.targetId),
    });
    grouped.set(mention.sourceId, list);
  }
  return grouped;
}

async function resolveReferenceMentions(text: string) {
  if (!text.includes("@")) {
    return [];
  }

  const explicitMentions = parseExplicitMentionTokens(text);
  const [people, references, calendarEvents] = await Promise.all([
    prisma.person.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
    }),
    prisma.reference.findMany({
      where: { title: { not: null } },
      select: { id: true, title: true },
    }),
    prisma.calendarEvent.findMany({
      where: { status: { not: "cancelled" } },
      select: { id: true, title: true, start: true },
      orderBy: { start: "desc" },
      take: 200,
    }),
  ]);

  const candidates = [
    ...people.map((person) => ({
      label: person.name,
      normalized: normalizeMention(person.name),
      targetType: "person" as const,
      targetId: person.id,
    })),
    ...references
      .filter((reference): reference is { id: string; title: string } =>
        Boolean(reference.title?.trim()),
      )
      .map((reference) => ({
        label: reference.title,
        normalized: normalizeMention(reference.title),
        targetType: "reference" as const,
        targetId: reference.id,
      })),
    ...calendarEvents.map((event) => ({
      label: event.title,
      normalized: normalizeMention(event.title),
      targetType: "calendar_event" as const,
      targetId: event.id,
    })),
  ].filter((candidate) => candidate.normalized.length > 0);

  const matches = new Map<string, ReferenceMentionTarget>();
  for (const mention of explicitMentions) {
    const target =
      mention.targetType === "person"
        ? people.find((person) => person.id === mention.targetId)
        : mention.targetType === "calendar_event"
          ? calendarEvents.find((event) => event.id === mention.targetId)
          : references.find((reference) => reference.id === mention.targetId);
    if (!target) continue;

    const label =
      mention.targetType === "person"
        ? people.find((person) => person.id === mention.targetId)?.name
        : mention.targetType === "calendar_event"
          ? calendarEvents.find((event) => event.id === mention.targetId)?.title
          : references.find((reference) => reference.id === mention.targetId)
              ?.title;

    matches.set(`${mention.targetType}:${mention.targetId}`, {
      label: label ?? mention.label,
      targetType: mention.targetType,
      targetId: mention.targetId,
      href: hrefForMentionTarget(mention.targetType, mention.targetId),
    });
  }

  for (const atIndex of atSymbolIndexes(text)) {
    if (text.slice(atIndex, atIndex + 3) === "@[[") continue;
    const tail = normalizeMention(text.slice(atIndex + 1, atIndex + 100));
    const match = candidates
      .filter((candidate) => tail.startsWith(candidate.normalized))
      .sort(
        (left, right) => right.normalized.length - left.normalized.length,
      )[0];
    if (!match) continue;

    matches.set(`${match.targetType}:${match.targetId}`, {
      label: match.label,
      targetType: match.targetType,
      targetId: match.targetId,
      href: hrefForMentionTarget(match.targetType, match.targetId),
    });
  }

  return Array.from(matches.values());
}

function parseExplicitMentionTokens(text: string) {
  return Array.from(
    text.matchAll(
      /@\[\[(person|reference|calendar_event):([^|\]]+)\|([^\]]+)]]/g,
    ),
  ).map((match) => ({
    targetType:
      match[1] === "person"
        ? ("person" as const)
        : match[1] === "calendar_event"
          ? ("calendar_event" as const)
          : ("reference" as const),
    targetId: match[2],
    label: match[3],
  }));
}

function hrefForMentionTarget(targetType: string, targetId: string) {
  if (targetType === "person") return `/people/${targetId}`;
  if (targetType === "calendar_event") return `/calendar-events/${targetId}`;
  return `/references/${targetId}`;
}

function atSymbolIndexes(text: string) {
  const indexes: number[] = [];
  for (
    let index = text.indexOf("@");
    index >= 0;
    index = text.indexOf("@", index + 1)
  ) {
    indexes.push(index);
  }
  return indexes;
}

function normalizeMention(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
