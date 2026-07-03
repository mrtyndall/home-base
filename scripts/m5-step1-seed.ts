// M5 step-1 test seed: three clearly-labeled test tasks (dev DB only).
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { prisma } = await import("../src/lib/db");
  for (const name of ["A", "B", "C"]) {
    await prisma.task.create({
      data: { title: `M5T step1 task ${name}`, source: "m5-test" },
    });
  }
  const count = await prisma.task.count({
    where: { title: { startsWith: "M5T step1" }, status: "open" },
  });
  console.log("seeded, open M5T step1 tasks:", count);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
