import { prisma } from "@/lib/db";
import { getLatestCheckIns } from "@/lib/checkins";
import { localDateString } from "@/lib/dates";
import { projectLastActivityFact } from "@/lib/slippage";

/** Derived domain-page aggregate: areas with latest check-ins, project
 *  facts, and the open-task pulse. Domains hold nothing themselves. */
export async function getDomainAggregate(domainId: string) {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) {
    return null;
  }

  const todayStr = localDateString();
  const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

  const [areas, projects, openTasks, dueToday] = await Promise.all([
    prisma.area.findMany({
      where: { domainId, status: { in: ["active", "parked"] } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { tasks: { where: { status: "open" } } },
        },
      },
    }),
    prisma.project.findMany({
      where: {
        status: "active",
        area: { domainId },
      },
      include: {
        activity: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.task.count({
      where: { status: "open", area: { domainId } },
    }),
    prisma.task.count({
      where: { status: "open", area: { domainId }, dueDate: { lte: todayDate } },
    }),
  ]);

  const [areaCheckIns, projectCheckIns, taskActivity] = await Promise.all([
    getLatestCheckIns("area", areas.map((area) => area.id)),
    getLatestCheckIns("project", projects.map((project) => project.id)),
    projects.length
      ? prisma.task.groupBy({
          by: ["projectId"],
          where: { projectId: { in: projects.map((project) => project.id) } },
          _max: { createdAt: true, completedAt: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const lastTaskActivityByProject = new Map<string, Date>();
  for (const group of taskActivity) {
    if (!group.projectId) continue;
    const latest = [
      group._max.createdAt,
      group._max.completedAt,
      group._max.updatedAt,
    ]
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => Number(b) - Number(a))[0];
    if (latest) {
      lastTaskActivityByProject.set(group.projectId, latest);
    }
  }

  const slipping = projects.flatMap((project) => {
    const dates = [
      lastTaskActivityByProject.get(project.id),
      project.activity[0]?.createdAt,
      projectCheckIns.get(project.id)?.createdAt,
    ].filter((date): date is Date => Boolean(date));
    const lastActivity = dates.sort((a, b) => Number(b) - Number(a))[0] ?? null;
    const fact = projectLastActivityFact(project, lastActivity);
    return fact ? [{ id: project.id, name: project.name, fact }] : [];
  });

  return {
    domain,
    areas: areas.map((area) => ({
      id: area.id,
      name: area.name,
      status: area.status,
      openTaskCount: area._count.tasks,
      latestCheckIn: areaCheckIns.get(area.id) ?? null,
    })),
    projectFacts: { activeCount: projects.length, slipping },
    taskPulse: { openTasks, dueToday },
  };
}
