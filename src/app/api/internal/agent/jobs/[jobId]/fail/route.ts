import { z } from "zod";
import { authenticateWorkerRole, WorkerAuthError } from "@/lib/agent/auth";
import { AgentJobError, failWorkerJob } from "@/lib/agent/jobs";
import { AgentLeaseError } from "@/lib/agent/queue";

const bodySchema = z.object({
  leaseToken: z.string().min(32).max(256),
  error: z.string().trim().min(1).max(1_000),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const role = authenticateWorkerRole(request);
    const { jobId } = await params;
    const body = bodySchema.parse(await request.json());
    const result = await failWorkerJob({ role, jobId, ...body });
    return Response.json({ ok: true, terminal: result.terminal });
  } catch (error) {
    if (error instanceof WorkerAuthError || error instanceof AgentJobError || error instanceof AgentLeaseError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request." }, { status: 400 });
    return Response.json({ error: "Worker failure callback is unavailable." }, { status: 503 });
  }
}
