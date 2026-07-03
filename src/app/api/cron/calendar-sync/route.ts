import { syncGoogleCalendar } from "@/lib/calendar/google";

export const dynamic = "force-dynamic";

// Scheduled entry point for the Railway cron service. The standalone runner
// image has no tsx/scripts, so the cron container curls this route instead of
// running scripts/sync-google-calendar.ts directly.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await syncGoogleCalendar();
  return Response.json(result, { status: result.status === "failed" ? 502 : 200 });
}
