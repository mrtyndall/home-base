import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { flattenAreaOptions } from "@/lib/hierarchy";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type AssignmentOptionsClient = {
  task: {
    findUnique(args: unknown): PromiseLike<{ id: string; status: string } | null>;
  };
  area: {
    findMany(args: unknown): PromiseLike<Array<{
      id: string;
      name: string;
      parentAreaId: string | null;
      sortOrder: number;
      status: "active" | "retired";
    }>>;
  };
  project: {
    findMany(args: unknown): PromiseLike<Array<{
      id: string;
      name: string;
      areaId: string | null;
    }>>;
  };
};

export async function taskAssignmentOptionsResponse(
  taskId: string,
  client: AssignmentOptionsClient = prisma as unknown as AssignmentOptionsClient,
) {
  const task = await client.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  if (task.status !== "open") {
    return NextResponse.json(
      { error: "Only open tasks can be reassigned." },
      { status: 409 },
    );
  }

  const areas = await client.area.findMany({
    where: { isSystem: false },
    select: {
      id: true,
      name: true,
      parentAreaId: true,
      sortOrder: true,
      status: true,
    },
  });
  const allAreaOptions = flattenAreaOptions(areas);
  const activeAreaIds = new Set(
    areas.filter((area) => area.status === "active").map((area) => area.id),
  );
  const areaOptions = allAreaOptions.filter((area) => activeAreaIds.has(area.id));
  const areaPaths = new Map(allAreaOptions.map((area) => [area.id, area.path]));
  const projects = await client.project.findMany({
    where: {
      status: { in: ["active", "parked", "someday"] },
      OR: [
        { areaId: null },
        { areaId: { in: areaOptions.map((area) => area.id) } },
      ],
    },
    select: { id: true, name: true, areaId: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return NextResponse.json({
    options: [
      { id: "inbox", type: "inbox", label: "Inbox", areaId: null, projectId: null },
      ...areaOptions.map((area) => ({
        id: area.id,
        type: "area",
        label: area.path,
        areaId: area.id,
        projectId: null,
      })),
      ...projects.map((project) => ({
        id: project.id,
        type: "project",
        label: `${project.name} — ${project.areaId ? areaPaths.get(project.areaId) : "No area yet"}`,
        areaId: project.areaId,
        projectId: project.id,
      })),
    ],
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { taskId } = await context.params;
  return taskAssignmentOptionsResponse(taskId);
}
