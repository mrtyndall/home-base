import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

assert.ok(
  existsSync("src/lib/area-compat.ts"),
  "Area creation needs an expand-schema compatibility helper.",
);

if (process.env.AREA_FIRST_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Set AREA_FIRST_DISPOSABLE_DATABASE=1 only for a disposable local database.");
}

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(
  ["127.0.0.1", "localhost", "::1"].includes(url.hostname),
  "Area compatibility integration only accepts a loopback database.",
);

async function main() {
  const [{ createCompatibleArea }, { prisma }] = await Promise.all([
    import("../src/lib/area-compat"),
    import("../src/lib/db"),
  ]);

  const suffix = randomUUID();
  const existingSystemId = `compat-existing-${suffix}`;
  const name = `Area compatibility ${suffix}`;

  try {
    await prisma.$executeRaw`
      INSERT INTO domains (id, name, description, sort_order, is_system, active)
      VALUES (${existingSystemId}, 'System', 'Existing compatibility row.', 0, true, false)
      ON CONFLICT (name) DO UPDATE SET id = ${existingSystemId}
    `;

    const before = await prisma.$queryRaw<Array<{ maxSortOrder: number | null }>>`
      SELECT MAX(sort_order) AS "maxSortOrder" FROM areas
    `;
    const area = await createCompatibleArea(prisma, { name });
    assert.equal(area.name, name);
    assert.equal(area.sortOrder, (before[0]?.maxSortOrder ?? -1) + 1);

    const rows = await prisma.$queryRaw<Array<{ domainId: string; isSystem: boolean }>>`
      SELECT domain_id AS "domainId", is_system AS "isSystem"
      FROM areas
      WHERE id = ${area.id}
    `;
    assert.equal(rows[0]?.domainId, existingSystemId);
    assert.equal(rows[0]?.isSystem, false);
    assert.deepEqual(Object.keys(area).sort(), ["id", "name", "sortOrder"]);

    const domains = await prisma.$queryRaw<Array<{ active: boolean; isSystem: boolean }>>`
      SELECT active, is_system AS "isSystem" FROM domains WHERE id = ${existingSystemId}
    `;
    assert.deepEqual(domains[0], { active: false, isSystem: true });
  } finally {
    await prisma.$disconnect();
  }
}

void main();
