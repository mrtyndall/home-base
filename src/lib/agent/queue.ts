import { randomBytes } from "node:crypto";
import {
  Prisma,
  type AgentJobKind,
  type AgentWorkerRole,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashWorkerToken } from "@/lib/agent/auth";

type AgentJobClient = Pick<typeof prisma, "agentJob" | "$queryRaw">;

export type EnqueueAgentJobInput = {
  role: AgentWorkerRole;
  kind: AgentJobKind;
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
  captureId?: string | null;
  chatMessageId?: string | null;
  promptVersion?: string | null;
  model?: string | null;
  maxAttempts?: number;
};

export async function enqueueAgentJob(
  input: EnqueueAgentJobInput,
  client: Pick<typeof prisma, "agentJob"> = prisma,
) {
  return client.agentJob.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      role: input.role,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      captureId: input.captureId ?? null,
      chatMessageId: input.chatMessageId ?? null,
      promptVersion: input.promptVersion ?? null,
      model: input.model ?? null,
      maxAttempts: input.maxAttempts ?? 5,
    },
    update: {},
  });
}

export async function claimAgentJob(
  input: {
    role: AgentWorkerRole;
    leaseOwner: string;
    leaseSeconds?: number;
  },
  client: AgentJobClient = prisma,
) {
  const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 120, 30), 900);
  const leaseToken = randomBytes(32).toString("base64url");
  const leaseHash = hashWorkerToken(leaseToken);
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT * FROM claim_agent_job(
      ${input.role}::"AgentWorkerRole",
      ${leaseHash},
      ${input.leaseOwner},
      ${leaseSeconds}
    )
  `;
  const claimed = rows[0];
  const job = claimed
    ? await client.agentJob.findUnique({ where: { id: claimed.id } })
    : null;
  return job ? { job, leaseToken } : null;
}

export async function heartbeatAgentJob(
  input: { jobId: string; leaseToken: string; leaseSeconds?: number },
  client: Pick<typeof prisma, "agentJob"> = prisma,
) {
  const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 120, 30), 900);
  const result = await client.agentJob.updateMany({
    where: {
      id: input.jobId,
      status: "leased",
      leaseTokenHash: hashWorkerToken(input.leaseToken),
      leaseExpiresAt: { gt: new Date() },
    },
    data: {
      leaseExpiresAt: new Date(Date.now() + leaseSeconds * 1_000),
    },
  });
  if (result.count !== 1) {
    throw new AgentLeaseError("Job lease is missing, expired, or reassigned.");
  }
}

export async function completeAgentJob(
  input: { jobId: string; leaseToken: string; result: Prisma.InputJsonValue },
  client: Pick<typeof prisma, "agentJob"> = prisma,
) {
  const leaseTokenHash = hashWorkerToken(input.leaseToken);
  const existing = await client.agentJob.findFirst({
    where: { id: input.jobId, status: "succeeded", leaseTokenHash },
  });
  if (existing) return existing;

  const updated = await client.agentJob.updateMany({
    where: {
      id: input.jobId,
      status: "leased",
      leaseTokenHash,
      leaseExpiresAt: { gt: new Date() },
    },
    data: {
      status: "succeeded",
      result: input.result,
      error: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
    },
  });
  if (updated.count !== 1) {
    throw new AgentLeaseError("Job lease is missing, expired, or reassigned.");
  }
  return client.agentJob.findUniqueOrThrow({ where: { id: input.jobId } });
}

export async function failAgentJob(
  input: { jobId: string; leaseToken: string; error: string },
  client: Pick<typeof prisma, "agentJob"> = prisma,
) {
  const leaseTokenHash = hashWorkerToken(input.leaseToken);
  const job = await client.agentJob.findFirst({
    where: {
      id: input.jobId,
      status: "leased",
      leaseTokenHash,
      leaseExpiresAt: { gt: new Date() },
    },
  });
  if (!job) {
    throw new AgentLeaseError("Job lease is missing, expired, or reassigned.");
  }

  const terminal = job.attempt >= job.maxAttempts;
  const updated = await client.agentJob.updateMany({
    where: { id: job.id, status: "leased", leaseTokenHash },
    data: {
      status: terminal ? "dead_letter" : "retry_wait",
      error: sanitizeWorkerError(input.error),
      availableAt: terminal
        ? job.availableAt
        : new Date(Date.now() + retryDelayMs(job.attempt)),
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: terminal ? new Date() : null,
    },
  });
  if (updated.count !== 1) {
    throw new AgentLeaseError("Job lease changed before failure was recorded.");
  }
  return { terminal };
}

export function retryDelayMs(attempt: number) {
  const normalizedAttempt = Math.max(1, Math.trunc(attempt));
  return Math.min(5_000 * 2 ** (normalizedAttempt - 1), 600_000);
}

function sanitizeWorkerError(error: string) {
  const trimmed = error.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").trim();
  return (trimmed || "Worker job failed.").slice(0, 1_000);
}

export class AgentLeaseError extends Error {
  readonly status = 409;
}
