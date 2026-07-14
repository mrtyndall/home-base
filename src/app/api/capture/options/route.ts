import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [areas, projects] = await Promise.all([
    prisma.area.findMany({
      where: { status: { in: ["active", "parked"] } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
      },
    }),
    prisma.project.findMany({
      where: { status: { in: ["active", "someday", "parked"] } },
      orderBy: [{ createdAt: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        areaId: true,
        area: {
          select: { name: true },
        },
      },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    areas,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      areaId: project.areaId,
      areaName: project.area.name,
    })),
  });
}
