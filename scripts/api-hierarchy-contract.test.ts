import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("src/app/api/v1/[...path]/route.ts", "utf8");
const mcp = readFileSync("mcp/http-server.ts", "utf8");
const parser = readFileSync("src/lib/capture/parser.ts", "utf8");
const capture = readFileSync("src/lib/capture/service.ts", "utf8");
const chat = readFileSync("src/lib/chat.ts", "utf8");

assert.match(api, /assertValidAreaParent/, "Area writes must use the shared parent validator");
assert.match(api, /fileProject/, "Project filing must use the shared atomic filing boundary");
assert.match(api, /areaId:\s*z\.string\(\)\.nullable\(\)\.optional\(\)/,
  "Project create and patch contracts must accept an Area ID or null");
assert.doesNotMatch(api, /Project creation requires an active Area/,
  "REST Project creation and updates must allow an omitted or null Area");
assert.match(api, /parentAreaId:\s*z\.string\(\)\.nullable\(\)\.optional\(\)/,
  "Area create and patch contracts must accept a parent Area ID or null");
assert.match(api, /HierarchyValidationError/,
  "hierarchy validation failures must have an explicit API mapping");
assert.match(api, /status:\s*400/,
  "hierarchy validation failures must return HTTP 400");
assert.match(api, /path:/,
  "Area hierarchy reads must return path labels");

assert.doesNotMatch(capture, /Project captures require an Area/,
  "capture-created Projects may remain unfiled");
assert.match(parser, /Project may be created unfiled/,
  "the parser must explicitly preserve unfiled Project intent");
assert.match(capture, /project\.area\?\.name \?\? "Unfiled"/,
  "capture receipts must identify unfiled Projects clearly");

for (const tool of ["list_areas", "create_area", "create_project", "reparent_area", "file_project"]) {
  assert.match(mcp, new RegExp(`"${tool}"`), `MCP must expose ${tool}`);
}
assert.match(mcp, /parentAreaId:\s*z\.string\(\)\.nullable\(\)\.optional\(\)/,
  "MCP Area tools must accept a parent Area ID or null");
assert.match(mcp, /areaId:\s*z\.string\(\)\.nullable\(\)\.optional\(\)/,
  "MCP Project tools must accept an Area ID or null");
assert.doesNotMatch(mcp, /parent domains|named domain|read_domain_page|domainId|domainName/i,
  "active MCP tools must not expose Domain-era hierarchy language");
assert.doesNotMatch(chat, /parent domains|named domain|read_domain_page|domainId|domainName/i,
  "chat contracts must not expose Domain-era hierarchy language");
