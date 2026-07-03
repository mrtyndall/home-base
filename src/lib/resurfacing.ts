import type { ResurfaceItemType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateOnlyFromString, localDateString } from "@/lib/dates";

const DAY_MS = 24 * 60 * 60 * 1000;
const JOURNAL_MIN_AGE_DAYS = 30;
const IDEA_MIN_AGE_DAYS = 60;
const SEEN_EXCLUSION_DAYS = 90;

export type ResurfacedItem = {
  seenId: string;
  itemType: ResurfaceItemType;
  itemId: string;
  body: string;
  itemDate: Date;
  ageDays: number;
  surfacedOn: Date;
};

function ageInDays(itemDate: Date) {
  return Math.max(Math.floor((Date.now() - itemDate.getTime()) / DAY_MS), 0);
}

/**
 * Today's resurfaced memory for the Today screen. Selects at most one
 * item per day (lazy, on first load); an empty candidate pool renders
 * nothing. Once the day's item has a response it stays retired for the
 * day unless `force` is set (dev/testing hook).
 */
export async function getDailyResurfacedItem(options?: {
  force?: boolean;
}): Promise<ResurfacedItem | null> {
  const today = dateOnlyFromString(localDateString());

  const todaysRows = await prisma.resurfacingSeen.findMany({
    where: { surfacedOn: today },
    orderBy: { createdAt: "desc" },
  });

  const open = todaysRows.find((row) => row.response === null);
  if (open) {
    const loaded = await loadItem(open.itemType, open.itemId, open.id, today);
    if (loaded) {
      return loaded;
    }
  }

  // All of today's selections carry a response (or the open item vanished):
  // stay quiet for the rest of the day unless forced (dev/test hook), except
  // when the open selection's item disappeared — then select a replacement.
  if (todaysRows.length > 0 && !open && !options?.force) {
    return null;
  }

  return selectNewItem(today, todaysRows.map((row) => `${row.itemType}:${row.itemId}`));
}

async function selectNewItem(today: Date, excludeKeys: string[]) {
  const journalCutoff = new Date(today.getTime() - JOURNAL_MIN_AGE_DAYS * DAY_MS);
  const ideaCutoff = new Date(today.getTime() - IDEA_MIN_AGE_DAYS * DAY_MS);
  const seenCutoff = new Date(today.getTime() - SEEN_EXCLUSION_DAYS * DAY_MS);

  const [recentSeen, journalEntries, ideas] = await Promise.all([
    prisma.resurfacingSeen.findMany({
      where: { surfacedOn: { gte: seenCutoff } },
      select: { itemType: true, itemId: true },
    }),
    prisma.journalEntry.findMany({
      where: { status: "active", entryDate: { lt: journalCutoff } },
      select: {
        id: true,
        bodyMd: true,
        entryDate: true,
        resurfaceWeight: true,
      },
      take: 400,
    }),
    prisma.idea.findMany({
      where: { status: { in: ["seed", "developing"] }, createdAt: { lt: ideaCutoff } },
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        resurfaceWeight: true,
      },
      take: 400,
    }),
  ]);

  const seenKeys = new Set(
    recentSeen.map((row) => `${row.itemType}:${row.itemId}`),
  );
  for (const key of excludeKeys) {
    seenKeys.add(key);
  }

  const candidates: Array<{
    itemType: ResurfaceItemType;
    itemId: string;
    body: string;
    itemDate: Date;
    weight: number;
  }> = [
    ...journalEntries
      .filter((entry) => !seenKeys.has(`journal_entry:${entry.id}`))
      .map((entry) => ({
        itemType: "journal_entry" as const,
        itemId: entry.id,
        body: entry.bodyMd,
        itemDate: entry.entryDate,
        weight: entry.resurfaceWeight,
      })),
    ...ideas
      .filter((idea) => !seenKeys.has(`idea:${idea.id}`))
      .map((idea) => ({
        itemType: "idea" as const,
        itemId: idea.id,
        body: idea.body ? `${idea.title} — ${idea.body}` : idea.title,
        itemDate: idea.createdAt,
        weight: idea.resurfaceWeight,
      })),
  ];

  if (candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce(
    (total, candidate) => total + Math.max(candidate.weight, 0.01),
    0,
  );
  let roll = Math.random() * totalWeight;
  let picked = candidates[candidates.length - 1];
  for (const candidate of candidates) {
    roll -= Math.max(candidate.weight, 0.01);
    if (roll <= 0) {
      picked = candidate;
      break;
    }
  }

  const seen = await prisma.resurfacingSeen.create({
    data: {
      itemType: picked.itemType,
      itemId: picked.itemId,
      surfacedOn: today,
    },
  });

  if (picked.itemType === "journal_entry") {
    await prisma.journalEntry.update({
      where: { id: picked.itemId },
      data: { lastSurfacedAt: new Date() },
    });
  } else {
    await prisma.idea.update({
      where: { id: picked.itemId },
      data: { lastSurfacedAt: new Date() },
    });
  }

  return {
    seenId: seen.id,
    itemType: picked.itemType,
    itemId: picked.itemId,
    body: picked.body,
    itemDate: picked.itemDate,
    ageDays: ageInDays(picked.itemDate),
    surfacedOn: today,
  };
}

async function loadItem(
  itemType: ResurfaceItemType,
  itemId: string,
  seenId: string,
  surfacedOn: Date,
): Promise<ResurfacedItem | null> {
  if (itemType === "journal_entry") {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: itemId },
      select: { bodyMd: true, entryDate: true, status: true },
    });
    if (!entry || entry.status !== "active") {
      return null;
    }
    return {
      seenId,
      itemType,
      itemId,
      body: entry.bodyMd,
      itemDate: entry.entryDate,
      ageDays: ageInDays(entry.entryDate),
      surfacedOn,
    };
  }

  const idea = await prisma.idea.findUnique({
    where: { id: itemId },
    select: { title: true, body: true, createdAt: true, status: true },
  });
  if (!idea || (idea.status !== "seed" && idea.status !== "developing")) {
    return null;
  }
  return {
    seenId,
    itemType,
    itemId,
    body: idea.body ? `${idea.title} — ${idea.body}` : idea.title,
    itemDate: idea.createdAt,
    ageDays: ageInDays(idea.createdAt),
    surfacedOn,
  };
}

const BOOST_FACTOR = 2;
const MAX_WEIGHT = 8;

export async function boostResurfaceWeight(
  itemType: ResurfaceItemType,
  itemId: string,
) {
  if (itemType === "journal_entry") {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: itemId },
      select: { resurfaceWeight: true },
    });
    if (!entry) return null;
    return prisma.journalEntry.update({
      where: { id: itemId },
      data: {
        resurfaceWeight: Math.min(entry.resurfaceWeight * BOOST_FACTOR, MAX_WEIGHT),
      },
    });
  }

  const idea = await prisma.idea.findUnique({
    where: { id: itemId },
    select: { resurfaceWeight: true },
  });
  if (!idea) return null;
  return prisma.idea.update({
    where: { id: itemId },
    data: {
      resurfaceWeight: Math.min(idea.resurfaceWeight * BOOST_FACTOR, MAX_WEIGHT),
    },
  });
}

/** Fuzzy-match a resurfaceable item by text for the boost_resurface capture action. */
export async function boostResurfaceByMatch(itemMatch: string) {
  const idea = await prisma.idea.findFirst({
    where: {
      status: { in: ["seed", "developing"] },
      title: { contains: itemMatch, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });
  if (idea) {
    await boostResurfaceWeight("idea", idea.id);
    return { itemType: "idea" as const, id: idea.id, label: idea.title };
  }

  const entry = await prisma.journalEntry.findFirst({
    where: {
      status: "active",
      bodyMd: { contains: itemMatch, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, bodyMd: true },
  });
  if (entry) {
    await boostResurfaceWeight("journal_entry", entry.id);
    return {
      itemType: "journal_entry" as const,
      id: entry.id,
      label: entry.bodyMd.slice(0, 60),
    };
  }

  return null;
}
