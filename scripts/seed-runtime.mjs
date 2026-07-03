import pg from "pg";
import crypto from "node:crypto";

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
  for (const domain of domains) {
    await pool.query(
      `
      INSERT INTO domains (id, name, description, sort_order, is_system, active)
      VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_system = EXCLUDED.is_system,
        active = true
      `,
      [
        crypto.randomUUID(),
        domain.name,
        domain.description,
        domain.sortOrder,
        domain.isSystem,
      ],
    );
  }

  for (const [key, value] of settings) {
    await pool.query(
      `
      INSERT INTO app_settings (id, key, value, updated_at)
      VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
      `,
      [crypto.randomUUID(), key, JSON.stringify(value)],
    );
  }

  await pool.query(
    `
    INSERT INTO calendar_sync_states
      (id, provider, calendar_id, status, created_at, updated_at)
    VALUES
      ('google-primary', 'google', 'primary', 'not_configured', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING
    `,
  );

  console.log(JSON.stringify({ status: "seeded" }));
} finally {
  await pool.end();
}
