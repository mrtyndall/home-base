import { Prisma, type AgentWorkerRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  claimAgentJob,
  completeAgentJob,
  failAgentJob,
  heartbeatAgentJob,
} from "@/lib/agent/queue";
import { buildSorterJobInput, applySorterProposal } from "@/lib/agent/sorter";
import {
  buildAssistantJobInput,
  completeAssistantMessage,
  failAssistantMessage,
} from "@/lib/agent/chat";
import {
  agentJobClaimSchema,
  agentModelSchema,
  sorterResultSchema,
} from "@/lib/agent/schemas";

export async function claimNextWorkerJob(input: {
  role: AgentWorkerRole;
  workerId: string;
  leaseSeconds?: number;
}) {
  const claim = await claimAgentJob({
    role: input.role,
    leaseOwner: input.workerId,
    leaseSeconds: input.leaseSeconds,
  });
  if (!claim) return null;

  try {
    const jobInput = claim.job.kind === "capture_sort"
      ? await buildSorterJobInput(requiredId(claim.job.captureId))
      : await buildAssistantJobInput(requiredId(claim.job.chatMessageId));
    return agentJobClaimSchema.parse({
      jobId: claim.job.id,
      leaseToken: claim.leaseToken,
      kind: claim.job.kind,
      input: jobInput,
    });
  } catch (error) {
    await failAgentJob({
      jobId: claim.job.id,
      leaseToken: claim.leaseToken,
      error: error instanceof Error ? error.message : "Job input could not be built.",
    });
    return null;
  }
}

export async function heartbeatWorkerJob(input: {
  role: AgentWorkerRole;
  jobId: string;
  leaseToken: string;
  leaseSeconds?: number;
}) {
  await assertJobRole(input.jobId, input.role);
  await heartbeatAgentJob(input);
}

export async function completeWorkerJob(input: {
  role: AgentWorkerRole;
  jobId: string;
  leaseToken: string;
  model: string;
  result: unknown;
}) {
  return prisma.$transaction(async (client) => {
    const model = agentModelSchema.parse(input.model);
    const job = await client.agentJob.findUnique({ where: { id: input.jobId } });
    if (!job || job.role !== input.role) throw new AgentJobError("Job was not found.", 404);
    if (job.status === "succeeded") {
      return completeAgentJob(
        {
          jobId: job.id,
          leaseToken: input.leaseToken,
          result: (job.result ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
        client,
      );
    }

    if (job.kind === "capture_sort") {
      const result = sorterResultSchema.parse(input.result);
      await applySorterProposal(
        {
          jobId: job.id,
          captureId: requiredId(job.captureId),
          result,
          model,
          promptVersion: job.promptVersion ?? undefined,
        },
        client,
      );
    } else {
      const answer = z.string().trim().min(1).max(20_000).parse(input.result);
      await completeAssistantMessage(requiredId(job.chatMessageId), answer, client);
    }

    await client.agentJob.update({
      where: { id: job.id },
      data: { model },
    });

    return completeAgentJob(
      {
        jobId: job.id,
        leaseToken: input.leaseToken,
        result: input.result as Prisma.InputJsonValue,
      },
      client,
    );
  });
}

export async function failWorkerJob(input: {
  role: AgentWorkerRole;
  jobId: string;
  leaseToken: string;
  error: string;
}) {
  return prisma.$transaction(async (client) => {
    const job = await client.agentJob.findUnique({ where: { id: input.jobId } });
    if (!job || job.role !== input.role) throw new AgentJobError("Job was not found.", 404);
    const result = await failAgentJob(input, client);
    if (result.terminal && job.chatMessageId) {
      await failAssistantMessage(job.chatMessageId, "The assistant could not complete this answer. Try again.", client);
    }
    return result;
  });
}

async function assertJobRole(jobId: string, role: AgentWorkerRole) {
  const job = await prisma.agentJob.findUnique({ where: { id: jobId }, select: { role: true } });
  if (!job || job.role !== role) throw new AgentJobError("Job was not found.", 404);
}

function requiredId(value: string | null) {
  if (!value) throw new Error("Job is missing its entity reference.");
  return value;
}

export class AgentJobError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
