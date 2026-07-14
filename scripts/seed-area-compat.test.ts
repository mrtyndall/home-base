import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const prismaSeed = readFileSync("prisma/seed.ts", "utf8");
const runtimeSeed = readFileSync("scripts/seed-runtime.mjs", "utf8");

assert.match(prismaSeed, /ensureCompatibilityDomainId|createCompatibleArea/);
assert.doesNotMatch(prismaSeed, /'domain_system'[\s\S]{0,220}INSERT INTO areas/);
assert.match(runtimeSeed, /ON CONFLICT \(name\) DO UPDATE[\s\S]{0,160}RETURNING id/);
assert.match(runtimeSeed, /compatibilityDomainId/);
assert.doesNotMatch(runtimeSeed, /VALUES\s*\(\$1, \$2, 'domain_system'/);

