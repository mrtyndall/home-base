import pg from "pg";
import crypto from "node:crypto";

const areas = [
  { name: "Home", sortOrder: 10 },
  { name: "Family", sortOrder: 20 },
  { name: "Health", sortOrder: 30 },
  { name: "Creative", sortOrder: 40 },
  { name: "Ham Radio", sortOrder: 50 },
  { name: "Homelab", sortOrder: 60 },
  { name: "Magic/Pokemon", sortOrder: 70 },
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
  // CONTRACT_RELEASE_DELETE: remove Domain compatibility SQL when areas.domain_id is removed.
  const compatibilityDomain = await pool.query(
    `
    INSERT INTO domains (id, name, description, sort_order, is_system, active)
    VALUES ($1, 'System', 'Hidden migration compatibility group.', 0, true, false)
    ON CONFLICT (name) DO UPDATE SET
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      is_system = EXCLUDED.is_system,
      active = EXCLUDED.active
    RETURNING id
    `,
    [crypto.randomUUID()],
  );
  const compatibilityDomainId = compatibilityDomain.rows[0]?.id;
  if (!compatibilityDomainId) throw new Error("Could not resolve the compatibility Domain.");

  for (const area of areas) {
    const existingArea = await pool.query(
      `SELECT id FROM areas WHERE name = $1 LIMIT 1`,
      [area.name],
    );
    const areaId =
      existingArea.rows[0]?.id ??
      area.id ??
      `area_seed_${area.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

    await pool.query(
      `
      INSERT INTO areas
        (id, name, domain_id, status, current_state, next_step, sort_order, is_system, created_at, updated_at)
      VALUES
        ($1, $2, $3, 'active', $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        current_state = COALESCE(EXCLUDED.current_state, areas.current_state),
        next_step = COALESCE(EXCLUDED.next_step, areas.next_step),
        sort_order = EXCLUDED.sort_order,
        is_system = EXCLUDED.is_system,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        areaId,
        area.name,
        compatibilityDomainId,
        area.currentState ?? null,
        area.nextStep ?? null,
        area.sortOrder,
        area.isSystem ?? false,
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
