import { z } from "zod";
import { authenticateWorkerRole, WorkerAuthError } from "@/lib/agent/auth";
import { AgentJobError, heartbeatWorkerJob } from "@/lib/agent/jobs";
import { AgentLeaseError } from "@/lib/agent/queue";

const bodySchema = z.object({
  leaseToken: z.string().min(32).max(256),
  leaseSeconds: z.number().int().min(30).max(900).default(180),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const role = authenticateWorkerRole(request);
    const { jobId } = await params;
    const body = bodySchema.parse(await request.json());
    await heartbeatWorkerJob({ role, jobId, ...body });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof WorkerAuthError || error instanceof AgentJobError || error instanceof AgentLeaseError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request." }, { status: 400 });
    return Response.json({ error: "Worker heartbeat is unavailable." }, { status: 503 });
  }
}
