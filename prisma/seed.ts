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
    name: "System",
    description: "Hidden system grouping for the Inbox area.",
    sortOrder: 0,
    isSystem: true,
    active: false,
  },
  {
    name: "Home",
    description: "House, errands, maintenance, admin, and family logistics.",
    sortOrder: 10,
    isSystem: false,
    active: true,
  },
  {
    name: "Family",
    description: "Family commitments, plans, and follow-ups.",
    sortOrder: 20,
    isSystem: false,
    active: true,
  },
  {
    name: "Health",
    description: "Health, appointments, fitness, and care tasks.",
    sortOrder: 30,
    isSystem: false,
    active: true,
  },
  {
    name: "Creative",
    description: "Personal writing, podcast, media, and creative threads.",
    sortOrder: 40,
    isSystem: false,
    active: true,
  },
  {
    name: "Hobbies",
    description: "Radio, homelab, solar research, and side builds.",
    sortOrder: 50,
    isSystem: false,
    active: true,
  },
];

type SeedArea = {
  id?: string;
  name: string;
  domainName: string;
  sortOrder: number;
  isSystem?: boolean;
  currentState?: string;
  nextStep?: string;
};

const areas: SeedArea[] = [
  {
    id: "area_inbox",
    name: "Inbox",
    domainName: "System",
    sortOrder: 0,
    isSystem: true,
    currentState: "System catch-all for quick-add and genuinely ambiguous captures.",
    nextStep: "Route items when the right area becomes clear.",
  },
  {
    name: "Home",
    domainName: "Home",
    sortOrder: 10,
  },
  {
    name: "Family",
    domainName: "Family",
    sortOrder: 20,
  },
  {
    name: "Health",
    domainName: "Health",
    sortOrder: 30,
  },
  {
    name: "Creative",
    domainName: "Creative",
    sortOrder: 40,
  },
  {
    name: "Ham Radio",
    domainName: "Hobbies",
    sortOrder: 10,
  },
  {
    name: "Homelab",
    domainName: "Hobbies",
    sortOrder: 20,
  },
  {
    name: "Magic/Pokemon",
    domainName: "Hobbies",
    sortOrder: 30,
  },
];

async function main() {
  for (const domain of domains) {
    await prisma.domain.upsert({
      where: { name: domain.name },
      update: domain,
      create: domain,
    });
  }

  for (const area of areas) {
    const domain = await prisma.domain.findUniqueOrThrow({
      where: { name: area.domainName },
    });
    const areaId = "id" in area ? area.id : `area_seed_${area.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const existingArea = await prisma.area.findFirst({
      where: { name: area.name, domainId: domain.id },
    });

    if (existingArea) {
      await prisma.area.update({
        where: { id: existingArea.id },
        data: {
          name: area.name,
          domainId: domain.id,
          sortOrder: area.sortOrder,
          isSystem: area.isSystem ?? false,
          currentState: area.currentState ?? existingArea.currentState,
          nextStep: area.nextStep ?? existingArea.nextStep,
        },
      });
    } else {
      await prisma.area.create({
        data: {
          id: areaId,
          name: area.name,
          domainId: domain.id,
          sortOrder: area.sortOrder,
          isSystem: area.isSystem ?? false,
          currentState: area.currentState ?? null,
          nextStep: area.nextStep ?? null,
        },
      });
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
