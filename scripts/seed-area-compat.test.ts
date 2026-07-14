import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const prismaSeed = readFileSync("prisma/seed.ts", "utf8");
const runtimeSeed = readFileSync("scripts/seed-runtime.mjs", "utf8");

function seedAreas(source: string) {
  const areaBlock = source.match(/const areas[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1] ?? "";
  return Array.from(
    areaBlock.matchAll(/name:\s*"([^"]+)"[\s\S]*?sortOrder:\s*(\d+)/g),
    ([, name, sortOrder]) => ({ name, sortOrder: Number(sortOrder) }),
  );
}

const canonicalAreas = [
  { name: "Home", sortOrder: 10 },
  { name: "Family", sortOrder: 20 },
  { name: "Health", sortOrder: 30 },
  { name: "Creative", sortOrder: 40 },
  { name: "Ham Radio", sortOrder: 50 },
  { name: "Homelab", sortOrder: 60 },
  { name: "Magic/Pokemon", sortOrder: 70 },
];

assert.deepEqual(seedAreas(prismaSeed), canonicalAreas);
assert.deepEqual(seedAreas(runtimeSeed), canonicalAreas);

assert.match(prismaSeed, /ensureCompatibilityDomainId|createCompatibleArea/);
assert.doesNotMatch(prismaSeed, /'domain_system'[\s\S]{0,220}INSERT INTO areas/);
assert.match(runtimeSeed, /ON CONFLICT \(name\) DO UPDATE[\s\S]{0,160}RETURNING id/);
assert.match(runtimeSeed, /compatibilityDomainId/);
assert.doesNotMatch(runtimeSeed, /VALUES\s*\(\$1, \$2, 'domain_system'/);
assert.match(
  runtimeSeed,
  /CONTRACT_RELEASE_DELETE:\s*remove Domain compatibility SQL when areas\.domain_id is removed/,
);
