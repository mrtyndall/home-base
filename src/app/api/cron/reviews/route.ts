import { prisma } from "@/lib/db";
import { dateOnlyFromString, localDateString } from "@/lib/dates";
import { isPushoverConfigured, sendPushoverMessage } from "@/lib/pushover";

// Daily job: surface scheduled reviews whose date has arrived. Date-anchored
// reviews reaching their window are the existing time-sensitive push trigger,
// so each newly surfaced one sends a single Pushover nudge (when configured).
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const today = dateOnlyFromString(localDateString());
  const due = await prisma.scheduledReview.findMany({
    where: { status: "pending", reviewAt: { lte: today } },
    include: { capture: { select: { rawText: true } } },
  });

  let nudged = 0;
  for (const review of due) {
    await prisma.scheduledReview.update({
      where: { id: review.id },
      data: { status: "surfaced" },
    });

    await prisma.notification.create({
      data: {
        type: "review_surfaced",
        title: "Needs review",
        body: review.capture.rawText,
        sourceRef: { type: "scheduled_review", id: review.id, source: "scheduler" },
      },
    });

    if (isPushoverConfigured()) {
      const result = await sendPushoverMessage(
        "Needs review",
        review.capture.rawText,
      );
      if (result.ok) {
        nudged += 1;
        await prisma.nudge.create({
          data: {
            trigger: "time_sensitive",
            title: "Needs review",
            body: review.capture.rawText,
            supportingData: {
              scheduledReviewId: review.id,
              reviewAt: review.reviewAt?.toISOString() ?? null,
            },
          },
        });
      }
    }
  }

  return Response.json({ surfaced: due.length, nudged });
}
