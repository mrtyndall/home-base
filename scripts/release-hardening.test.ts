import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dockerfile = readFileSync("Dockerfile", "utf8");
const runtimeSeed = readFileSync("scripts/seed-runtime.mjs", "utf8");
const prismaSeed = readFileSync("prisma/seed.ts", "utf8");
const releaseVerifier = readFileSync("scripts/verify-area-first-release.ts", "utf8");

assert.doesNotMatch(
  dockerfile,
  /RUN\s+npm install\s+prisma\s+dotenv/,
  "The production image must not resolve unlocked migration tooling during its build.",
);
assert.match(
  dockerfile,
  /COPY --from=builder --chown=nextjs:nodejs \/app\/node_modules \.\/node_modules/,
  "The runner must reuse the lockfile-pinned, post-generation dependency tree.",
);
assert.match(
  dockerfile,
  /npx --no-install prisma migrate deploy/,
  "Production migration startup must never download a different Prisma CLI.",
);

assert.doesNotMatch(runtimeSeed, /\bdomains\b|\bareas\b|DO UPDATE/i);
assert.match(runtimeSeed, /ON CONFLICT \("key"\) DO NOTHING/);
assert.match(runtimeSeed, /ON CONFLICT \("id"\) DO NOTHING/);

assert.doesNotMatch(
  prismaSeed,
  /prisma\.area\.update|appSetting\.upsert/,
  "Explicit seeding may fill missing defaults but must not overwrite user-managed state.",
);
assert.match(prismaSeed, /appSetting\.findUnique/);
assert.match(prismaSeed, /appSetting\.create/);

for (const invariant of [
  /projects[\s\S]*area_inbox/,
  /tasks[\s\S]*project_id[\s\S]*area_id/,
  /references[\s\S]*kind[\s\S]*book/,
  /references[\s\S]*kind[\s\S]*movie/,
]) {
  assert.match(releaseVerifier, invariant);
}
assert.match(releaseVerifier, /BEGIN TRANSACTION READ ONLY/);
assert.match(releaseVerifier, /--preflight/);
assert.match(releaseVerifier, /Post-release baseline:/);
assert.doesNotMatch(releaseVerifier, /INSERT|UPDATE|DELETE|DROP|ALTER/i);
