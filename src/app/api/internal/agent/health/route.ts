import { authenticateWorkerRole, WorkerAuthError } from "@/lib/agent/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const role = authenticateWorkerRole(request);
    const [queued, leased, deadLetter, oldest, lastSuccess] = await Promise.all([
      prisma.agentJob.count({ where: { role, status: { in: ["queued", "retry_wait"] } } }),
      prisma.agentJob.count({ where: { role, status: "leased" } }),
      prisma.agentJob.count({ where: { role, status: "dead_letter" } }),
      prisma.agentJob.findFirst({
        where: { role, status: { in: ["queued", "retry_wait"] } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.agentJob.findFirst({
        where: { role, status: "succeeded" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
    ]);
    return Response.json({
      role,
      queued,
      leased,
      deadLetter,
      oldestQueuedAt: oldest?.createdAt.toISOString() ?? null,
      lastSucceededAt: lastSuccess?.completedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof WorkerAuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Worker health is unavailable." }, { status: 503 });
  }
}
