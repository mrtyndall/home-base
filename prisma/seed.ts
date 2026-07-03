import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const domains = [
  {
    name: "Inbox",
    description: "System catch-all for genuinely ambiguous captures.",
    sortOrder: 0,
    isSystem: true,
  },
  {
    name: "Home",
    description: "House, errands, maintenance, admin, and family logistics.",
    sortOrder: 10,
    isSystem: false,
  },
  {
    name: "Family",
    description: "Family commitments, plans, and follow-ups.",
    sortOrder: 20,
    isSystem: false,
  },
  {
    name: "Health",
    description: "Health, appointments, fitness, and care tasks.",
    sortOrder: 30,
    isSystem: false,
  },
  {
    name: "Creative",
    description: "Personal writing, podcast, media, and creative threads.",
    sortOrder: 40,
    isSystem: false,
  },
  {
    name: "Hobbies/Homelab",
    description: "Radio, homelab, solar research, and side builds.",
    sortOrder: 50,
    isSystem: false,
  },
];

async function main() {
  for (const domain of domains) {
    await prisma.domain.upsert({
      where: { name: domain.name },
      update: domain,
      create: { ...domain, active: true },
    });
  }

  const settings = [
    ["default_slip_threshold_days", 14],
    ["default_due_date_reminder_time", "08:00"],
    ["google_calendar_stale_minutes", 30],
  ] as const;

  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  await prisma.calendarSyncState.upsert({
    where: { id: "google-primary" },
    update: {},
    create: {
      id: "google-primary",
      provider: "google",
      status: "not_configured",
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
