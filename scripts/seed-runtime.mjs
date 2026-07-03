import pg from "pg";
import crypto from "node:crypto";

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

const areas = [
  {
    id: "area_inbox",
    name: "Inbox",
    domainName: "System",
    sortOrder: 0,
    isSystem: true,
    currentState: "System catch-all for quick-add and genuinely ambiguous captures.",
    nextStep: "Route items when the right area becomes clear.",
  },
  { name: "Home", domainName: "Home", sortOrder: 10 },
  { name: "Family", domainName: "Family", sortOrder: 20 },
  { name: "Health", domainName: "Health", sortOrder: 30 },
  { name: "Creative", domainName: "Creative", sortOrder: 40 },
  { name: "Ham Radio", domainName: "Hobbies", sortOrder: 10 },
  { name: "Homelab", domainName: "Hobbies", sortOrder: 20 },
  { name: "Magic/Pokemon", domainName: "Hobbies", sortOrder: 30 },
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
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_system = EXCLUDED.is_system,
        active = EXCLUDED.active
      `,
      [
        crypto.randomUUID(),
        domain.name,
        domain.description,
        domain.sortOrder,
        domain.isSystem,
        domain.active,
      ],
    );
  }

  for (const area of areas) {
    const domainResult = await pool.query(
      `SELECT id FROM domains WHERE name = $1 LIMIT 1`,
      [area.domainName],
    );
    const domainId = domainResult.rows[0]?.id;
    if (!domainId) {
      throw new Error(`Missing domain for area ${area.name}`);
    }

    const existingArea = await pool.query(
      `SELECT id FROM areas WHERE name = $1 AND domain_id = $2 LIMIT 1`,
      [area.name, domainId],
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
        domain_id = EXCLUDED.domain_id,
        current_state = COALESCE(EXCLUDED.current_state, areas.current_state),
        next_step = COALESCE(EXCLUDED.next_step, areas.next_step),
        sort_order = EXCLUDED.sort_order,
        is_system = EXCLUDED.is_system,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        areaId,
        area.name,
        domainId,
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
