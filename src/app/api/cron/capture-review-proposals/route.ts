import { createCaptureReviewProposals } from "@/lib/capture/review-proposals";

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

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 20;
  const result = await createCaptureReviewProposals({
    limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 20,
  });

  return Response.json(result);
}
