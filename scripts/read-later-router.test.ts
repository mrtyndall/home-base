import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchReadLaterRoute,
  readLaterRouteScope,
} from "../src/lib/api/read-later-router";

const READ_ID = "11111111-1111-4111-8111-111111111111";
const REF_ID = "22222222-2222-4222-8222-222222222222";

function services() {
  const calls: string[] = [];
  return {
    calls,
    value: {
      list: async () => { calls.push("list"); return [{ id: READ_ID }]; },
      read: async (id: string) => { calls.push(`read:${id}`); return { id }; },
      create: async () => { calls.push("create"); return { id: "created" }; },
      fileReadLater: async (id: string) => { calls.push(`file-read:${id}`); return { id }; },
      fileReference: async (id: string) => { calls.push(`file-reference:${id}`); return { id }; },
      status: async (id: string) => { calls.push(`status:${id}`); return { id }; },
    },
  };
}

test("actual Read Later router selects scopes and returns contract envelopes", async () => {
  assert.equal(readLaterRouteScope("GET", ["read-later"]), "read");
  assert.equal(readLaterRouteScope("POST", ["read-later"]), "write");
  assert.equal(readLaterRouteScope("GET", ["tasks"]), null);
  const fake = services();
  const response = await dispatchReadLaterRoute({
    method: "GET", path: ["read-later"], url: new URL("http://test/api/v1/read-later"),
    body: undefined, actor: { label: "Hermes" }, services: fake.value as never,
  });
  assert.ok(response);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { references: [{ id: READ_ID }] });
  assert.deepEqual(fake.calls, ["list"]);
});

test("router strictly rejects extra and missing path segments without creating", async () => {
  for (const [method, path] of [
    ["POST", ["read-later", READ_ID]],
    ["POST", ["read-later", READ_ID, "typo"]],
    ["GET", ["read-later", READ_ID, "status"]],
    ["GET", ["read-later", READ_ID, "extra"]],
  ] as const) {
    const fake = services();
    const response = await dispatchReadLaterRoute({
      method, path: [...path], url: new URL("http://test/api/v1/read-later"),
      body: {}, actor: { label: "Hermes" }, services: fake.value as never,
    });
    assert.ok(response);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: "read_later_route_not_found", message: "Read Later route not found." },
    });
    assert.deepEqual(fake.calls, []);
  }
});

test("router distinguishes Read Later and general Reference file contracts", async () => {
  const fake = services();
  const readLater = await dispatchReadLaterRoute({
    method: "POST", path: ["read-later", READ_ID, "file"],
    url: new URL("http://test"), body: { areaId: null, projectId: null },
    actor: { label: "Hermes" }, services: fake.value as never,
  });
  const reference = await dispatchReadLaterRoute({
    method: "POST", path: ["references", REF_ID, "file"],
    url: new URL("http://test"), body: { areaId: null, projectId: null },
    actor: { label: "Hermes" }, services: fake.value as never,
  });
  assert.equal(readLater?.status, 200);
  assert.equal(reference?.status, 200);
  assert.deepEqual(fake.calls, [`file-read:${READ_ID}`, `file-reference:${REF_ID}`]);
});

test("router returns stable validation and internal errors", async () => {
  const fake = services();
  fake.value.create = async () => { throw new Error("database credential detail"); };
  const internal = await dispatchReadLaterRoute({
    method: "POST", path: ["read-later"], url: new URL("http://test"),
    body: { url: "https://example.com" }, actor: { label: "Hermes" }, services: fake.value as never,
  });
  assert.equal(internal?.status, 500);
  assert.deepEqual(await internal?.json(), {
    error: { code: "read_later_request_failed", message: "Read Later request failed." },
  });

  const invalid = await dispatchReadLaterRoute({
    method: "POST", path: ["read-later"], url: new URL("http://test"),
    body: { url: "" }, actor: { label: "Hermes" }, services: services().value as never,
  });
  assert.equal(invalid?.status, 400);
  assert.deepEqual(await invalid?.json(), {
    error: { code: "invalid_read_later_request", message: "Invalid Read Later request." },
  });
});
