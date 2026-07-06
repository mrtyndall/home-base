import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [domains, projects] = await Promise.all([
    prisma.domain.findMany({
      where: {
        OR: [{ active: true, isSystem: false }, { name: "System" }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        isSystem: true,
        areas: {
          where: { status: { in: ["active", "parked"] } },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            domainId: true,
          },
        },
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
          select: {
            name: true,
            domain: { select: { name: true } },
          },
        },
      },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    domains: domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      isSystem: domain.isSystem,
      areas: domain.areas.map((area) => ({
        id: area.id,
        name: area.name,
        domainId: area.domainId,
      })),
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      areaId: project.areaId,
      areaName: project.area.name,
      domainName: project.area.domain.name,
    })),
  });
}
