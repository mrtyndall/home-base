"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  addDaysToDateString,
  dateOnlyFromString,
  localDateString,
} from "@/lib/dates";

function getTrimmed(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function loadOpenReview(reviewId: string) {
  if (!reviewId) return null;
  const review = await prisma.scheduledReview.findUnique({
    where: { id: reviewId },
    include: { capture: { select: { rawText: true } } },
  });
  if (!review || review.status === "done" || review.status === "dismissed") {
    return null;
  }
  return review;
}

async function settleReview(reviewId: string, status: "done" | "dismissed") {
  const review = await loadOpenReview(reviewId);
  if (!review) return;

  await prisma.scheduledReview.update({
    where: { id: review.id },
    data: { status },
  });

  await prisma.notification.create({
    data: {
      type: status === "done" ? "review_done" : "review_dismissed",
      title: status === "done" ? "Review done" : "Review dismissed",
      body: review.capture.rawText,
      sourceRef: { type: "scheduled_review", id: review.id, source: "manual" },
    },
  });

  revalidatePath("/");
}

export async function markReviewDone(formData: FormData) {
  await settleReview(getTrimmed(formData, "reviewId"), "done");
}

export async function dismissReview(formData: FormData) {
  await settleReview(getTrimmed(formData, "reviewId"), "dismissed");
}

export async function snoozeReview(formData: FormData) {
  const review = await loadOpenReview(getTrimmed(formData, "reviewId"));
  const snoozeUntil = getTrimmed(formData, "snoozeUntil");
  if (!review || !/^\d{4}-\d{2}-\d{2}$/.test(snoozeUntil)) return;

  await prisma.scheduledReview.update({
    where: { id: review.id },
    data: { status: "pending", reviewAt: dateOnlyFromString(snoozeUntil) },
  });

  await prisma.notification.create({
    data: {
      type: "review_snoozed",
      title: `Review snoozed to ${snoozeUntil}`,
      body: review.capture.rawText,
      sourceRef: { type: "scheduled_review", id: review.id, source: "manual" },
    },
  });

  revalidatePath("/");
}

export async function snoozeReviewOneDay(formData: FormData) {
  const review = await loadOpenReview(getTrimmed(formData, "reviewId"));
  if (!review) return;

  const snoozeUntil = addDaysToDateString(localDateString(), 1);

  await prisma.scheduledReview.update({
    where: { id: review.id },
    data: { status: "pending", reviewAt: dateOnlyFromString(snoozeUntil) },
  });

  await prisma.notification.create({
    data: {
      type: "review_snoozed",
      title: "Review snoozed",
      body: review.capture.rawText,
      sourceRef: {
        type: "scheduled_review",
        id: review.id,
        source: "manual",
        snoozeUntil,
      },
    },
  });

  revalidatePath("/");
}
