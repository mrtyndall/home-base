import { z } from "zod";
import { authenticateWorkerRole, WorkerAuthError } from "@/lib/agent/auth";
import { AgentJobError, completeWorkerJob } from "@/lib/agent/jobs";
import { AgentLeaseError } from "@/lib/agent/queue";
import { agentJobCompletionSchema } from "@/lib/agent/schemas";

const bodySchema = agentJobCompletionSchema.extend({
  leaseToken: z.string().min(32).max(256),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const role = authenticateWorkerRole(request);
    const { jobId } = await params;
    const body = bodySchema.parse(await request.json());
    await completeWorkerJob({ role, jobId, ...body });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof WorkerAuthError || error instanceof AgentJobError || error instanceof AgentLeaseError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid worker result." }, { status: 400 });
    return Response.json({ error: "Worker completion is unavailable." }, { status: 503 });
  }
}
