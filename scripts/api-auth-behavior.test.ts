import assert from "node:assert/strict";
import test from "node:test";
import { authenticateApiRequest, hashToken } from "../src/lib/api/auth";

function authClient(scopes: string[], revokedAt: Date | null = null) {
  const updates: unknown[] = [];
  return {
    updates,
    client: {
      apiKey: {
        findUnique: async ({ where }: { where: { tokenHash: string } }) => {
          assert.equal(where.tokenHash, hashToken("test-token"));
          return { id: "key-1", label: "Test", rateLimit: 10, scopes, revokedAt };
        },
        update: async (args: unknown) => { updates.push(args); return {}; },
      },
    },
  };
}

test("API authentication returns 401 when the request has no bearer token", async () => {
  await assert.rejects(
    authenticateApiRequest(new Request("http://home.test/api/v1/projects"), "write", {} as never),
    (error: unknown) => (error as { status?: number }).status === 401,
  );
});

test("API authentication enforces write scope before recording key use", async () => {
  const fake = authClient(["read"]);
  await assert.rejects(
    authenticateApiRequest(
      new Request("http://home.test/api/v1/projects", { headers: { authorization: "Bearer test-token" } }),
      "write",
      fake.client as never,
    ),
    (error: unknown) => (error as { status?: number }).status === 403,
  );
  assert.equal(fake.updates.length, 0);
});

test("API authentication accepts write scope and records last use", async () => {
  const fake = authClient(["write"]);
  const key = await authenticateApiRequest(
    new Request("http://home.test/api/v1/projects", { headers: { authorization: "Bearer test-token" } }),
    "write",
    fake.client as never,
  );
  assert.equal(key.label, "Test");
  assert.equal(fake.updates.length, 1);
});
