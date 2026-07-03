import { config } from "dotenv";
import { sendDueReminders } from "../src/lib/reminders";

config({ path: ".env.local" });
config();

sendDueReminders()
  .then((result) => {
    console.log(JSON.stringify({ status: "ok", ...result }));
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Pushover is not configured.")) {
      console.log(JSON.stringify({ status: "not_configured", sent: 0 }));
      return;
    }

    console.error(message);
    process.exit(1);
  });
