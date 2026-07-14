import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("src/app/api/v1/[...path]/route.ts", "utf8");
const mcp = readFileSync("mcp/http-server.ts", "utf8");

assert.match(api, /assertValidAreaParent/);
assert.match(api, /fileProject/);
assert.match(api, /parentAreaId/);
assert.match(api, /path:/);
assert.match(mcp, /"list_areas"/);
assert.match(mcp, /"create_area"/);
assert.match(mcp, /"create_project"/);
assert.match(mcp, /"reparent_area"/);
assert.match(mcp, /"file_project"/);
assert.doesNotMatch(mcp, /parent domains|named domain|read_domain_page|domainId|domainName/i);

console.log("API hierarchy contract verified.");
