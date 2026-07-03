-- M3 hierarchy migration: Domains -> Areas -> Projects -> Tasks.
-- Existing alpha data is mapped forward; no rows are hard-deleted.

-- Extend project lifecycle.
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'someday';

-- New hierarchy and shared-depth enums.
CREATE TYPE "AreaStatus" AS ENUM ('active', 'parked', 'retired');
CREATE TYPE "EntityParentType" AS ENUM ('area', 'project');
CREATE TYPE "EntityDocStatus" AS ENUM ('active', 'archived');
CREATE TYPE "MilestoneStatus" AS ENUM ('open', 'completed');

-- Areas sit between domains and projects/tasks.
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "status" "AreaStatus" NOT NULL DEFAULT 'active',
    "current_state" TEXT,
    "next_step" TEXT,
    "tending_cadence" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- Convert the old Inbox domain into the hidden system domain when it exists.
DO $$
DECLARE
  inbox_domain_id TEXT;
  system_domain_id TEXT;
BEGIN
  SELECT id INTO inbox_domain_id FROM "domains" WHERE "name" = 'Inbox' LIMIT 1;
  SELECT id INTO system_domain_id FROM "domains" WHERE "name" = 'System' LIMIT 1;

  IF system_domain_id IS NULL THEN
    IF inbox_domain_id IS NOT NULL THEN
      UPDATE "domains"
      SET "name" = 'System',
          "description" = 'Hidden system grouping for the Inbox area.',
          "sort_order" = 0,
          "is_system" = true,
          "active" = false
      WHERE "id" = inbox_domain_id;
      system_domain_id := inbox_domain_id;
    ELSE
      system_domain_id := 'domain_system';
      INSERT INTO "domains" ("id", "name", "description", "sort_order", "is_system", "active")
      VALUES (system_domain_id, 'System', 'Hidden system grouping for the Inbox area.', 0, true, false);
    END IF;
  ELSE
    UPDATE "domains"
    SET "description" = 'Hidden system grouping for the Inbox area.',
        "sort_order" = 0,
        "is_system" = true,
        "active" = false
    WHERE "id" = system_domain_id;

    IF inbox_domain_id IS NOT NULL AND inbox_domain_id <> system_domain_id THEN
      UPDATE "domains"
      SET "is_system" = true,
          "active" = false
      WHERE "id" = inbox_domain_id;
    END IF;
  END IF;

  INSERT INTO "areas" (
    "id", "name", "domain_id", "status", "current_state", "next_step",
    "sort_order", "is_system", "created_at", "updated_at"
  )
  VALUES (
    'area_inbox', 'Inbox', system_domain_id, 'active',
    'System catch-all for quick-add and genuinely ambiguous captures.',
    'Route items when the right area becomes clear.',
    0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO NOTHING;
END $$;

-- Each active, non-system domain gets a same-named area for alpha data.
INSERT INTO "areas" (
  "id", "name", "domain_id", "status", "current_state", "next_step",
  "sort_order", "is_system", "created_at", "updated_at"
)
SELECT
  'area_' || d."id",
  d."name",
  d."id",
  'active',
  NULL,
  NULL,
  d."sort_order",
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "domains" d
WHERE d."active" = true
  AND d."is_system" = false
ON CONFLICT ("id") DO NOTHING;

-- New shared container tables.
CREATE TABLE "entity_notes" (
    "id" TEXT NOT NULL,
    "parent_type" "EntityParentType" NOT NULL,
    "parent_id" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "source" TEXT,
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entity_docs" (
    "id" TEXT NOT NULL,
    "parent_type" "EntityParentType" NOT NULL,
    "parent_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "status" "EntityDocStatus" NOT NULL DEFAULT 'active',
    "source" TEXT,
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_docs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "parent_type" "EntityParentType" NOT NULL,
    "parent_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'open',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- Add new hierarchy columns while old domain columns still exist for mapping.
ALTER TABLE "projects" ADD COLUMN "area_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN "area_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN "someday" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ideas" ADD COLUMN "area_id" TEXT;
ALTER TABLE "ideas" ADD COLUMN "project_id" TEXT;
ALTER TABLE "references" ADD COLUMN "area_id" TEXT;
ALTER TABLE "references" ADD COLUMN "project_id" TEXT;

-- Map projects to the same-named area under their old domain, falling back to Inbox.
UPDATE "projects" p
SET "area_id" = COALESCE(
  (
    SELECT a."id"
    FROM "areas" a
    WHERE a."id" = 'area_' || p."domain_id"
    LIMIT 1
  ),
  'area_inbox'
);

-- Project assignment implies task area. Otherwise map from old task domain.
UPDATE "tasks" t
SET "area_id" = COALESCE(
  (
    SELECT p."area_id"
    FROM "projects" p
    WHERE p."id" = t."project_id"
    LIMIT 1
  ),
  (
    SELECT a."id"
    FROM "areas" a
    WHERE a."id" = 'area_' || t."domain_id"
    LIMIT 1
  ),
  'area_inbox'
);

UPDATE "ideas" i
SET "area_id" = COALESCE(
  (
    SELECT a."id"
    FROM "areas" a
    WHERE a."id" = 'area_' || i."domain_id"
    LIMIT 1
  ),
  CASE WHEN i."domain_id" IS NULL THEN NULL ELSE 'area_inbox' END
);

UPDATE "references" r
SET "area_id" = COALESCE(
  (
    SELECT a."id"
    FROM "areas" a
    WHERE a."id" = 'area_' || r."domain_id"
    LIMIT 1
  ),
  CASE WHEN r."domain_id" IS NULL THEN NULL ELSE 'area_inbox' END
);

ALTER TABLE "projects" ALTER COLUMN "area_id" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "area_id" SET DEFAULT 'area_inbox';
ALTER TABLE "tasks" ALTER COLUMN "area_id" SET NOT NULL;

-- Retire old domain foreign keys and indexes after successful mapping.
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_domain_id_fkey";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_domain_id_fkey";
ALTER TABLE "ideas" DROP CONSTRAINT IF EXISTS "ideas_domain_id_fkey";
ALTER TABLE "references" DROP CONSTRAINT IF EXISTS "references_domain_id_fkey";

DROP INDEX IF EXISTS "projects_domain_id_status_idx";
DROP INDEX IF EXISTS "tasks_domain_id_status_idx";
DROP INDEX IF EXISTS "ideas_domain_id_status_idx";
DROP INDEX IF EXISTS "references_domain_id_idx";

ALTER TABLE "projects" DROP COLUMN "domain_id";
ALTER TABLE "tasks" DROP COLUMN "domain_id";
ALTER TABLE "ideas" DROP COLUMN "domain_id";
ALTER TABLE "references" DROP COLUMN "domain_id";

-- New indexes.
CREATE INDEX "areas_domain_id_status_sort_order_idx" ON "areas"("domain_id", "status", "sort_order");
CREATE INDEX "areas_status_sort_order_idx" ON "areas"("status", "sort_order");
CREATE INDEX "projects_area_id_status_idx" ON "projects"("area_id", "status");
CREATE INDEX "tasks_area_id_status_idx" ON "tasks"("area_id", "status");
CREATE INDEX "tasks_someday_status_idx" ON "tasks"("someday", "status");
CREATE INDEX "ideas_area_id_status_idx" ON "ideas"("area_id", "status");
CREATE INDEX "ideas_project_id_status_idx" ON "ideas"("project_id", "status");
CREATE INDEX "references_area_id_idx" ON "references"("area_id");
CREATE INDEX "references_project_id_idx" ON "references"("project_id");
CREATE INDEX "entity_notes_parent_type_parent_id_created_at_idx" ON "entity_notes"("parent_type", "parent_id", "created_at");
CREATE INDEX "entity_notes_capture_id_idx" ON "entity_notes"("capture_id");
CREATE INDEX "entity_docs_parent_type_parent_id_status_idx" ON "entity_docs"("parent_type", "parent_id", "status");
CREATE INDEX "entity_docs_capture_id_idx" ON "entity_docs"("capture_id");
CREATE INDEX "documents_parent_type_parent_id_idx" ON "documents"("parent_type", "parent_id");
CREATE INDEX "milestones_project_id_status_sort_order_idx" ON "milestones"("project_id", "status", "sort_order");

-- New foreign keys.
ALTER TABLE "areas" ADD CONSTRAINT "areas_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "references" ADD CONSTRAINT "references_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "references" ADD CONSTRAINT "references_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "entity_notes" ADD CONSTRAINT "entity_notes_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "entity_docs" ADD CONSTRAINT "entity_docs_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep task.area_id aligned with task.project_id at the database boundary.
CREATE OR REPLACE FUNCTION sync_task_project_area()
RETURNS trigger AS $$
DECLARE
  project_area_id TEXT;
BEGIN
  IF NEW."project_id" IS NOT NULL THEN
    SELECT "area_id" INTO project_area_id FROM "projects" WHERE "id" = NEW."project_id";

    IF project_area_id IS NULL THEN
      RAISE EXCEPTION 'Task project_id % does not reference a project with an area.', NEW."project_id";
    END IF;

    NEW."area_id" := project_area_id;
  END IF;

  IF NEW."area_id" IS NULL THEN
    NEW."area_id" := 'area_inbox';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_sync_project_area BEFORE INSERT OR UPDATE OF "project_id", "area_id" ON "tasks"
FOR EACH ROW EXECUTE FUNCTION sync_task_project_area();

-- Integrity guardrails for new tables.
CREATE TRIGGER areas_no_delete BEFORE DELETE ON "areas"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER entity_notes_no_delete BEFORE DELETE ON "entity_notes"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER entity_docs_no_delete BEFORE DELETE ON "entity_docs"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER documents_no_delete BEFORE DELETE ON "documents"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER milestones_no_delete BEFORE DELETE ON "milestones"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

-- Full-text indexes for shared markdown containers.
CREATE INDEX "entity_notes_fts_idx" ON "entity_notes" USING GIN (
  to_tsvector('pg_catalog.english'::regconfig, COALESCE("body_md", ''))
);

CREATE INDEX "entity_docs_fts_idx" ON "entity_docs" USING GIN (
  to_tsvector('pg_catalog.english'::regconfig, COALESCE("title", '') || ' ' || COALESCE("body_md", ''))
);
