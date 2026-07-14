-- Expand release for the area-first taxonomy.
-- The obsolete domains table and areas.domain_id column intentionally remain
-- physical until the later contract release.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "projects" WHERE "area_id" = 'area_inbox') THEN
    RAISE EXCEPTION 'Cannot detach Inbox: projects still reference area_inbox';
  END IF;
END $$;

ALTER TABLE "tasks" ALTER COLUMN "area_id" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "area_id" DROP NOT NULL;

-- Preserve project -> area mirroring, but allow genuinely unfiled tasks to
-- remain global rather than being rewritten to the legacy Inbox area.
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE "tasks" t
SET "area_id" = p."area_id"
FROM "projects" p
WHERE t."project_id" = p."id"
  AND t."area_id" IS DISTINCT FROM p."area_id";

UPDATE "tasks" SET "area_id" = NULL WHERE "area_id" = 'area_inbox';
UPDATE "routines" SET "area_id" = NULL WHERE "area_id" = 'area_inbox';
UPDATE "ideas" SET "area_id" = NULL WHERE "area_id" = 'area_inbox';
UPDATE "references" SET "area_id" = NULL WHERE "area_id" = 'area_inbox';
UPDATE "people" SET "area_id" = NULL WHERE "area_id" = 'area_inbox';
UPDATE "capture_review_proposals" SET "suggested_area_id" = NULL
WHERE "suggested_area_id" = 'area_inbox';

ALTER TABLE "entity_notes" ALTER COLUMN "parent_type" DROP NOT NULL;
ALTER TABLE "entity_notes" ALTER COLUMN "parent_id" DROP NOT NULL;
ALTER TABLE "entity_docs" ALTER COLUMN "parent_type" DROP NOT NULL;
ALTER TABLE "entity_docs" ALTER COLUMN "parent_id" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "parent_type" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "parent_id" DROP NOT NULL;

UPDATE "entity_notes" SET "parent_type" = NULL, "parent_id" = NULL
WHERE "parent_type" = 'area' AND "parent_id" = 'area_inbox';
UPDATE "entity_docs" SET "parent_type" = NULL, "parent_id" = NULL
WHERE "parent_type" = 'area' AND "parent_id" = 'area_inbox';
UPDATE "documents" SET "parent_type" = NULL, "parent_id" = NULL
WHERE "parent_type" = 'area' AND "parent_id" = 'area_inbox';

ALTER TABLE "entity_notes" ADD CONSTRAINT "entity_notes_parent_pair_check"
CHECK (("parent_type" IS NULL) = ("parent_id" IS NULL));
ALTER TABLE "entity_docs" ADD CONSTRAINT "entity_docs_parent_pair_check"
CHECK (("parent_type" IS NULL) = ("parent_id" IS NULL));
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_pair_check"
CHECK (("parent_type" IS NULL) = ("parent_id" IS NULL));
