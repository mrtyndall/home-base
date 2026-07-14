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

type SeedArea = {
  id?: string;
  name: string;
  sortOrder: number;
  isSystem?: boolean;
  currentState?: string;
  nextStep?: string;
};

const areas: SeedArea[] = [
  {
    name: "Home",
    sortOrder: 10,
  },
  {
    name: "Family",
    sortOrder: 20,
  },
  {
    name: "Health",
    sortOrder: 30,
  },
  {
    name: "Creative",
    sortOrder: 40,
  },
  {
    name: "Ham Radio",
    sortOrder: 10,
  },
  {
    name: "Homelab",
    sortOrder: 20,
  },
  {
    name: "Magic/Pokemon",
    sortOrder: 30,
  },
];

async function main() {
  // The expand migration intentionally retains the physical Domain column
  // until the later contract release. Keep that legacy detail hidden here.
  await prisma.$executeRaw`
    INSERT INTO domains (id, name, description, sort_order, is_system, active)
    VALUES ('domain_system', 'System', 'Hidden migration compatibility group.', 0, true, false)
    ON CONFLICT (name) DO NOTHING
  `;

  for (const area of areas) {
    const areaId = "id" in area ? area.id : `area_seed_${area.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const existingArea = await prisma.area.findFirst({
      where: { name: area.name },
    });

    if (existingArea) {
      await prisma.area.update({
        where: { id: existingArea.id },
        data: {
          name: area.name,
          sortOrder: area.sortOrder,
          isSystem: area.isSystem ?? false,
          currentState: area.currentState ?? existingArea.currentState,
          nextStep: area.nextStep ?? existingArea.nextStep,
        },
      });
    } else {
      await prisma.$executeRaw`
        INSERT INTO areas
          (id, name, domain_id, status, current_state, next_step, sort_order, is_system, created_at, updated_at)
        VALUES
          (${areaId}, ${area.name}, 'domain_system', 'active', ${area.currentState ?? null}, ${area.nextStep ?? null}, ${area.sortOrder}, ${area.isSystem ?? false}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
    }
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
