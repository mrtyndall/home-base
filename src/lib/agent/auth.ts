import crypto from "node:crypto";
import type { AgentWorkerRole } from "@prisma/client";

export type WorkerCredentialHashes = Record<AgentWorkerRole, string>;

export function hashWorkerToken(token: string) {
  if (token.length < 32) {
    throw new WorkerAuthError("Worker credential is not configured safely.", 503);
  }
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function loadWorkerCredentialHashes(
  env: NodeJS.ProcessEnv = process.env,
): WorkerCredentialHashes {
  return {
    sorter: env.HOME_BASE_SORTER_TOKEN_SHA256 ?? "",
    assistant: env.HOME_BASE_ASSISTANT_TOKEN_SHA256 ?? "",
  };
}

export function authenticateWorkerRequest(
  request: Request,
  expectedRole: AgentWorkerRole,
  hashes: WorkerCredentialHashes = loadWorkerCredentialHashes(),
) {
  assertDistinctConfiguredHashes(hashes);
  const configuredHash = hashes[expectedRole];
  if (!/^[a-f0-9]{64}$/i.test(configuredHash)) {
    throw new WorkerAuthError("Worker authentication is unavailable.", 503);
  }

  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? "";
  if (token.length < 32) {
    throw new WorkerAuthError("Unauthorized.", 401);
  }

  const actual = Buffer.from(hashWorkerToken(token), "hex");
  const expected = Buffer.from(configuredHash, "hex");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new WorkerAuthError("Unauthorized.", 401);
  }

  return expectedRole;
}

export function authenticateWorkerRole(
  request: Request,
  hashes: WorkerCredentialHashes = loadWorkerCredentialHashes(),
): AgentWorkerRole {
  assertDistinctConfiguredHashes(hashes);
  const configured = (Object.entries(hashes) as Array<[AgentWorkerRole, string]>)
    .filter(([, hash]) => /^[a-f0-9]{64}$/i.test(hash));
  if (configured.length === 0) {
    throw new WorkerAuthError("Worker authentication is unavailable.", 503);
  }
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? "";
  if (token.length < 32) throw new WorkerAuthError("Unauthorized.", 401);
  const actual = Buffer.from(hashWorkerToken(token), "hex");
  for (const [role, configuredHash] of configured) {
    const expected = Buffer.from(configuredHash, "hex");
    if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
      return role;
    }
  }
  throw new WorkerAuthError("Unauthorized.", 401);
}

function assertDistinctConfiguredHashes(hashes: WorkerCredentialHashes) {
  const configured = Object.values(hashes)
    .filter((hash) => /^[a-f0-9]{64}$/i.test(hash))
    .map((hash) => hash.toLowerCase());
  if (new Set(configured).size !== configured.length) {
    throw new WorkerAuthError("Worker authentication is unavailable.", 503);
  }
}

export class WorkerAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
