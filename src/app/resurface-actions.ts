"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { dateOnlyFromString, localDateString } from "@/lib/dates";
import { boostResurfaceWeight } from "@/lib/resurfacing";

async function loadSeen(seenId: string) {
  if (!seenId) return null;
  return prisma.resurfacingSeen.findUnique({ where: { id: seenId } });
}

export async function dismissResurfacedItem(formData: FormData) {
  const seen = await loadSeen(String(formData.get("seenId") ?? ""));
  if (!seen || seen.response !== null) return;

  await prisma.resurfacingSeen.update({
    where: { id: seen.id },
    data: { response: "dismissed" },
  });

  await prisma.notification.create({
    data: {
      type: "resurface_dismissed",
      title: "Resurfaced memory dismissed",
      body: `${seen.itemType === "idea" ? "Idea" : "Journal entry"} set aside for now.`,
      sourceRef: { type: seen.itemType, id: seen.itemId, source: "manual" },
    },
  });

  revalidatePath("/today");
}

export async function boostResurfacedItem(formData: FormData) {
  const seen = await loadSeen(String(formData.get("seenId") ?? ""));
  if (!seen || seen.response !== null) return;

  await boostResurfaceWeight(seen.itemType, seen.itemId);
  await prisma.resurfacingSeen.update({
    where: { id: seen.id },
    data: { response: "kept" },
  });

  await prisma.notification.create({
    data: {
      type: "resurface_boosted",
      title: "Resurfaced memory boosted",
      body: "It will come around more often.",
      sourceRef: { type: seen.itemType, id: seen.itemId, source: "manual" },
    },
  });

  revalidatePath("/today");
}

export async function annotateResurfacedItem(formData: FormData) {
  const seen = await loadSeen(String(formData.get("seenId") ?? ""));
  const thought = String(formData.get("thought") ?? "").trim();
  if (!seen || seen.response !== null || !thought) return;

  if (seen.itemType === "idea") {
    await prisma.ideaNote.create({
      data: { ideaId: seen.itemId, body: thought },
    });
  } else {
    await prisma.journalEntry.create({
      data: {
        entryDate: dateOnlyFromString(localDateString()),
        bodyMd: thought,
        source: "typed",
        tags: ["resurfaced-thought"],
      },
    });
  }

  await prisma.resurfacingSeen.update({
    where: { id: seen.id },
    data: { response: "annotated" },
  });

  await prisma.notification.create({
    data: {
      type: "resurface_annotated",
      title: "Thought added to resurfaced memory",
      body: thought.slice(0, 140),
      sourceRef: { type: seen.itemType, id: seen.itemId, source: "manual" },
    },
  });

  revalidatePath("/today");
}
