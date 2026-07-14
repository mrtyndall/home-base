import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

// Expand-release shim only: delete this module when the contract migration
// removes areas.domain_id and the domains table.

type AreaCompatibilityClient = Pick<PrismaClient, "$queryRaw">;

type CompatibleAreaInput = {
  id?: string;
  name: string;
  sortOrder?: number;
  isSystem?: boolean;
  currentState?: string | null;
  nextStep?: string | null;
};

type CompatibleArea = {
  id: string;
  name: string;
  sortOrder: number;
};

export async function ensureCompatibilityDomainId(
  client: AreaCompatibilityClient,
): Promise<string> {
  const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO domains (id, name, description, sort_order, is_system, active)
    VALUES (${randomUUID()}, 'System', 'Hidden migration compatibility group.', 0, true, false)
    ON CONFLICT (name) DO UPDATE SET
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      is_system = EXCLUDED.is_system,
      active = EXCLUDED.active
    RETURNING id
  `);
  const id = rows[0]?.id;
  if (!id) throw new Error("Could not resolve the compatibility Domain.");
  return id;
}

export async function createCompatibleArea(
  client: AreaCompatibilityClient,
  input: CompatibleAreaInput,
): Promise<CompatibleArea> {
  const compatibilityDomainId = await ensureCompatibilityDomainId(client);
  const sortOrder = input.sortOrder ?? null;
  const rows = await client.$queryRaw<CompatibleArea[]>(Prisma.sql`
    INSERT INTO areas
      (id, name, domain_id, status, current_state, next_step, sort_order, is_system, created_at, updated_at)
    VALUES
      (
        ${input.id ?? randomUUID()},
        ${input.name},
        ${compatibilityDomainId},
        'active',
        ${input.currentState ?? null},
        ${input.nextStep ?? null},
        COALESCE(${sortOrder}, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM areas)),
        ${input.isSystem ?? false},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    RETURNING id, name, sort_order AS "sortOrder"
  `);
  const area = rows[0];
  if (!area) throw new Error("Could not create the Area.");
  return area;
}
