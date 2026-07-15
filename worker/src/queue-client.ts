import { agentJobClaimSchema, type AgentJobClaim } from "../../src/lib/agent/schemas.js";
import type { WorkerConfig } from "./config.js";

export class QueueClient {
  constructor(private readonly config: WorkerConfig) {}

  async claim(signal: AbortSignal): Promise<AgentJobClaim | null> {
    const response = await this.request("/api/internal/agent/jobs/claim", {
      method: "POST",
      body: JSON.stringify({ workerId: this.config.workerId, leaseSeconds: 180 }),
      signal,
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Job claim failed (${response.status}).`);
    return agentJobClaimSchema.parse(await response.json());
  }

  async heartbeat(jobId: string, leaseToken: string, signal: AbortSignal) {
    const response = await this.request(`/api/internal/agent/jobs/${jobId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ leaseToken, leaseSeconds: 180 }),
      signal,
    });
    if (!response.ok) throw new Error(`Job heartbeat failed (${response.status}).`);
  }

  async complete(jobId: string, leaseToken: string, result: unknown, signal: AbortSignal) {
    const response = await this.request(`/api/internal/agent/jobs/${jobId}/complete`, {
      method: "POST",
      body: JSON.stringify({ leaseToken, model: this.config.model, result }),
      signal,
    });
    if (!response.ok) throw new Error(`Job completion failed (${response.status}).`);
  }

  async fail(jobId: string, leaseToken: string, error: string, signal: AbortSignal) {
    const response = await this.request(`/api/internal/agent/jobs/${jobId}/fail`, {
      method: "POST",
      body: JSON.stringify({ leaseToken, error: sanitizeError(error) }),
      signal,
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`Job failure callback failed (${response.status}).`);
    }
  }

  private request(path: string, init: RequestInit) {
    return fetch(`${this.config.homeBaseUrl}${path}`, {
      ...init,
      redirect: "error",
      headers: {
        authorization: `Bearer ${this.config.workerToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
    });
  }
}

function sanitizeError(error: string) {
  return error.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").trim().slice(0, 1_000) || "Worker job failed.";
}
