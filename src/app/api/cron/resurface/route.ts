import { getDailyResurfacedItem } from "@/lib/resurfacing";

// Midnight-cron / test hook for the daily resurfacing selection. The Today
// screen also selects lazily on first load, so this route is optional.
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

  const force = new URL(request.url).searchParams.get("force") === "1";
  const item = await getDailyResurfacedItem({ force });

  return Response.json({
    selected: item
      ? {
          seenId: item.seenId,
          itemType: item.itemType,
          itemId: item.itemId,
          itemDate: item.itemDate,
        }
      : null,
  });
}
