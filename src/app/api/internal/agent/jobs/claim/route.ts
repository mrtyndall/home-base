import { z } from "zod";
import { authenticateWorkerRole, WorkerAuthError } from "@/lib/agent/auth";
import { AgentJobError, claimNextWorkerJob } from "@/lib/agent/jobs";
import { isAgentWorkerEnabled } from "@/lib/agent/schemas";

const bodySchema = z.object({
  workerId: z.string().trim().min(1).max(200),
  leaseSeconds: z.number().int().min(30).max(900).default(180),
}).strict();

export async function POST(request: Request) {
  try {
    const role = authenticateWorkerRole(request);
    if (!isAgentWorkerEnabled(role)) return new Response(null, { status: 204 });
    const body = bodySchema.parse(await request.json());
    const claim = await claimNextWorkerJob({ role, ...body });
    return claim ? Response.json(claim) : new Response(null, { status: 204 });
  } catch (error) {
    return agentErrorResponse(error);
  }
}

function agentErrorResponse(error: unknown) {
  if (error instanceof WorkerAuthError || error instanceof AgentJobError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  return Response.json({ error: "Worker queue is unavailable." }, { status: 503 });
}
