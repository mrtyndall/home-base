import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  if (query.length < 1) {
    return Response.json({ items: [] });
  }

  const [people, references, calendarEvents] = await Promise.all([
    prisma.person.findMany({
      where: {
        status: "active",
        name: { contains: query, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        relationshipType: true,
        company: true,
      },
      orderBy: { name: "asc" },
      take: 5,
    }),
    prisma.reference.findMany({
      where: {
        title: { contains: query, mode: "insensitive" },
      },
      select: {
        id: true,
        title: true,
        body: true,
        kind: true,
      },
      orderBy: [{ kind: "asc" }, { title: "asc" }],
      take: 8,
    }),
    prisma.calendarEvent.findMany({
      where: {
        status: { not: "cancelled" },
        title: { contains: query, mode: "insensitive" },
      },
      select: { id: true, title: true, start: true },
      orderBy: { start: "desc" },
      take: 5,
    }),
  ]);

  return Response.json({
    items: [
      ...people.map((person) => ({
        id: person.id,
        targetType: "person",
        type: "person",
        label: person.name,
        preview: [person.relationshipType, person.company]
          .filter(Boolean)
          .join(" · "),
      })),
      ...references.map((reference) => ({
        id: reference.id,
        targetType: "reference",
        type: reference.kind,
        label: reference.title ?? reference.body,
        preview: reference.body,
      })),
      ...calendarEvents.map((event) => ({
        id: event.id,
        targetType: "calendar_event",
        type: "meeting",
        label: event.title,
        preview: event.start.toISOString().slice(0, 10),
      })),
    ].slice(0, 8),
  });
}
