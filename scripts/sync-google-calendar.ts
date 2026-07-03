import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const { syncGoogleCalendar } = await import("../src/lib/calendar/google");
  const { prisma } = await import("../src/lib/db");

  try {
    const result = await syncGoogleCalendar();
    console.log(JSON.stringify(result));
    if (result.status === "failed") {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
