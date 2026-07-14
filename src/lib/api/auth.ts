import crypto from "node:crypto";
import { type ApiKey } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ApiScope = "read" | "write" | "capture";

export type AuthenticatedApiKey = Pick<
  ApiKey,
  "id" | "label" | "rateLimit"
> & {
  scopes: ApiScope[];
};

const rateBuckets = new Map<string, { resetAt: number; count: number }>();

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function parseBearerToken(authHeader: string | null) {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function authenticateApiRequest(
  request: Request,
  requiredScope: ApiScope,
  client: Pick<typeof prisma, "apiKey"> = prisma,
) {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    throw new ApiAuthError("Missing bearer token.", 401);
  }

  const key = await client.apiKey.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!key || key.revokedAt) {
    throw new ApiAuthError("Invalid or revoked API key.", 401);
  }

  const scopes = normalizeScopes(key.scopes);
  if (!scopes.includes(requiredScope)) {
    throw new ApiAuthError(`Missing required scope: ${requiredScope}.`, 403);
  }

  if (requiredScope !== "read") {
    enforceRateLimit(key.id, key.rateLimit);
  }

  await client.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    id: key.id,
    label: key.label,
    rateLimit: key.rateLimit,
    scopes,
  };
}

export function normalizeScopes(value: unknown): ApiScope[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((scope): scope is ApiScope =>
    scope === "read" || scope === "write" || scope === "capture",
  );
}

function enforceRateLimit(keyId: string, limit: number) {
  const now = Date.now();
  const existing = rateBuckets.get(keyId);
  const resetAt = existing?.resetAt && existing.resetAt > now
    ? existing.resetAt
    : now + 60 * 60_000;
  const count = existing?.resetAt === resetAt ? existing.count + 1 : 1;

  if (count > limit) {
    throw new ApiAuthError("API key write rate limit exceeded.", 429);
  }

  rateBuckets.set(keyId, { resetAt, count });
}

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}
