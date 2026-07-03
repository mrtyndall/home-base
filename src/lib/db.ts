import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "";
  const needsSsl =
    url.includes("sslmode=require") ||
    url.includes("railway.internal") ||
    url.includes("supabase.co") ||
    url.includes("supabase.com");

  const pool = new pg.Pool({
    connectionString: url || undefined,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: Number(
      process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? 5_000,
    ),
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

type PrismaClientInstance = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientInstance | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
