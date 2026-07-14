import pg from "pg";
import crypto from "node:crypto";

const settings = [
  ["default_slip_threshold_days", 14],
  ["default_due_date_reminder_time", "08:00"],
  ["google_calendar_stale_minutes", 30],
];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const needsSsl =
  databaseUrl.includes("sslmode=require") ||
  databaseUrl.includes("railway.internal") ||
  databaseUrl.includes("supabase.co") ||
  databaseUrl.includes("supabase.com");

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
  for (const [key, value] of settings) {
    await pool.query(
      `
      INSERT INTO "app_settings" ("id", "key", "value", "updated_at")
      VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO NOTHING
      `,
      [crypto.randomUUID(), key, JSON.stringify(value)],
    );
  }

  await pool.query(
    `
    INSERT INTO "calendar_sync_states"
      ("id", "provider", "calendar_id", "status", "created_at", "updated_at")
    VALUES
      ('google-primary', 'google', 'primary', 'not_configured', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING
    `,
  );

  console.log(JSON.stringify({ status: "bootstrap-ready" }));
} finally {
  await pool.end();
}
