import { getLatestCheckIns } from "@/lib/checkins";
import { localDateString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { projectLastActivityFact } from "@/lib/slippage";

/** Derived Area workspace aggregate with project health and task pulse. */
export async function getAreaAggregate(areaId: string) {
  const area = await prisma.area.findUnique({ where: { id: areaId } });
  if (!area) return null;

  const todayDate = new Date(`${localDateString()}T00:00:00.000Z`);
  const [projects, openTasks, dueToday, latestAreaCheckIn] = await Promise.all([
    prisma.project.findMany({
      where: { areaId, status: "active" },
      include: { activity: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.task.count({ where: { areaId, status: "open" } }),
    prisma.task.count({
      where: { areaId, status: "open", dueDate: { lte: todayDate } },
    }),
    getLatestCheckIns("area", [areaId]),
  ]);

  const [projectCheckIns, taskActivity] = await Promise.all([
    getLatestCheckIns("project", projects.map((project) => project.id)),
    projects.length
      ? prisma.task.groupBy({
          by: ["projectId"],
          where: { projectId: { in: projects.map((project) => project.id) } },
          _max: { createdAt: true, completedAt: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const taskActivityByProject = new Map<string, Date>();
  for (const group of taskActivity) {
    if (!group.projectId) continue;
    const latest = [group._max.createdAt, group._max.completedAt, group._max.updatedAt]
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => Number(b) - Number(a))[0];
    if (latest) taskActivityByProject.set(group.projectId, latest);
  }

  const slipping = projects.flatMap((project) => {
    const lastActivity = [
      taskActivityByProject.get(project.id),
      project.activity[0]?.createdAt,
      projectCheckIns.get(project.id)?.createdAt,
    ]
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => Number(b) - Number(a))[0] ?? null;
    const fact = projectLastActivityFact(project, lastActivity);
    return fact ? [{ id: project.id, name: project.name, fact }] : [];
  });

  return {
    area,
    latestCheckIn: latestAreaCheckIn.get(areaId) ?? null,
    projectFacts: { activeCount: projects.length, slipping },
    taskPulse: { openTasks, dueToday },
  };
}
