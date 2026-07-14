import assert from "node:assert/strict";
import test from "node:test";

import { updateEntityNoteForApi } from "../src/lib/api/entity-note";

test("agent note updates and their audit are committed in one transaction", async () => {
  const calls: string[] = [];
  const tx = {
    entityNote: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push("note");
        return { id: where.id, ...data };
      },
    },
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("audit");
        return { id: "audit-1", ...data };
      },
    },
  };
  const client = {
    $transaction: async <T>(operation: (client: typeof tx) => Promise<T>) => {
      calls.push("transaction");
      return operation(tx);
    },
  };

  const note = await updateEntityNoteForApi(
    "note-1",
    { bodyMd: "Updated" },
    { label: "Hermes" },
    client as never,
  );

  assert.equal(note.bodyMd, "Updated");
  assert.equal(note.source, "api:Hermes");
  assert.deepEqual(calls, ["transaction", "note", "audit"]);
});

test("an entity-note audit failure rolls back the note update", async () => {
  const state = { bodyMd: "Before", source: "manual" };
  const tx = {
    entityNote: {
      update: async ({ data }: { data: Partial<typeof state> }) => {
        Object.assign(state, data);
        return { id: "note-1", ...state };
      },
    },
    notification: { create: async () => { throw new Error("audit failed"); } },
  };
  const client = {
    $transaction: async <T>(operation: (client: typeof tx) => Promise<T>) => {
      const before = { ...state };
      try {
        return await operation(tx);
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  };

  await assert.rejects(
    updateEntityNoteForApi("note-1", { bodyMd: "After" }, { label: "Hermes" }, client as never),
    /audit failed/,
  );
  assert.deepEqual(state, { bodyMd: "Before", source: "manual" });
});
