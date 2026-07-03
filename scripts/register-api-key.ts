import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { hashToken } from "../src/lib/api/auth";

config({ path: ".env.local" });
config();

const label = process.argv[2];
const scopes = (process.argv[3] ?? "read")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);
const rateLimit = Number(process.argv[4] ?? 60);
const token = process.env.HOME_BASE_API_TOKEN;

if (!label) {
  console.error("Usage: set HOME_BASE_API_TOKEN from 1Password, then run npm run api:key:register -- <label> read,write,capture [rateLimit]");
  process.exit(1);
}

if (!token) {
  console.error("HOME_BASE_API_TOKEN is required. Generate/store the token outside this script, then register its hash.");
  process.exit(1);
}

const keyLabel = label;
const tokenHash = hashToken(token);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  await prisma.apiKey.upsert({
    where: { tokenHash },
    update: {
      label: keyLabel,
      scopes,
      rateLimit,
      revokedAt: null,
    },
    create: {
      tokenHash,
      label: keyLabel,
      scopes,
      rateLimit,
    },
  });

  console.log(JSON.stringify({ status: "ok", label: keyLabel, scopes, rateLimit }));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
