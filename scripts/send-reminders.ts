import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const { sendDueReminders } = await import("../src/lib/reminders");
  const result = await sendDueReminders();
  console.log(JSON.stringify({ status: "ok", ...result }));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Pushover is not configured.")) {
    console.log(JSON.stringify({ status: "not_configured", sent: 0 }));
    return;
  }

  console.error(message);
  process.exit(1);
});
