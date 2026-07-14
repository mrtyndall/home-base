import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { registerTools } from "../mcp/http-server";
import { TOOL_CONTRACTS } from "../mcp/http-server.contract-manifest";
import { patchTaskSchema } from "../src/app/api/v1/[...path]/route";

type ToolRegistration = {
  name: string;
  config: { inputSchema?: { safeParse(input: unknown): { success: boolean } } };
};

function collectTools() {
  const registrations: ToolRegistration[] = [];
  registerTools({
    registerTool(name: string, config: ToolRegistration["config"]) {
      registrations.push({ name, config });
    },
  } as never, "contract-token-placeholder");
  return registrations;
}

test("generic REST task updates reject lifecycle status and keep update plus audit transactional", () => {
  assert.equal(patchTaskSchema.safeParse({ title: "Rename" }).success, true);
  assert.equal(patchTaskSchema.safeParse({ status: "completed" }).success, false);
  assert.equal(patchTaskSchema.safeParse({ status: "killed" }).success, false);

  const source = readFileSync("src/app/api/v1/[...path]/route.ts", "utf8");
  const patchHandler = source.slice(source.indexOf("export async function PATCH"));
  const patchBranch = patchHandler.match(/if \(resource === "tasks"\) \{[\s\S]*?\n    \}\n\n    if \(resource === "projects"\)/);
  assert.ok(patchBranch, "task PATCH branch should be present");
  assert.doesNotMatch(patchBranch[0], /status:\s*parsed\.status/);
  assert.match(patchBranch[0], /prisma\.\$transaction\(/);
  assert.match(patchBranch[0], /tx\.task\.update\(/);
  assert.match(patchBranch[0], /tx\.notification\.create\(/);
  assert.doesNotMatch(patchBranch[0], /await auditApiWrite\(/);
});

test("MCP update_task rejects completion while complete_task uses the dedicated boundary", () => {
  const tools = collectTools();
  const update = tools.find((tool) => tool.name === "update_task");
  const complete = tools.find((tool) => tool.name === "complete_task");
  assert.ok(update?.config.inputSchema);
  assert.ok(complete?.config.inputSchema);

  assert.equal(update.config.inputSchema.safeParse({ taskId: "task-1", title: "Rename" }).success, true);
  assert.equal(update.config.inputSchema.safeParse({ taskId: "task-1", status: "completed" }).success, false);
  assert.equal(update.config.inputSchema.safeParse({ taskId: "task-1", status: "killed" }).success, false);
  assert.equal(complete.config.inputSchema.safeParse({ taskId: "task-1" }).success, true);

  const updateContract = TOOL_CONTRACTS.find((contract) => contract.name === "update_task");
  const completeContract = TOOL_CONTRACTS.find((contract) => contract.name === "complete_task");
  assert.equal(updateContract?.request.method, "PATCH");
  assert.equal(completeContract?.request.method, "POST");
  assert.match(completeContract?.request.path ?? "", /\/tasks\/[^/]+\/complete$/);
});
