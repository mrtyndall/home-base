-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CaptureSource" AS ENUM ('in_app_text', 'in_app_voice', 'ios_shortcut', 'android_shortcut', 'api');

-- CreateEnum
CREATE TYPE "CaptureParseStatus" AS ENUM ('parsed', 'ambiguous', 'failed');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'parked', 'completed', 'killed');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'completed', 'killed');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('seed', 'developing', 'converted', 'killed');

-- CreateEnum
CREATE TYPE "ConvertedToType" AS ENUM ('task', 'project');

-- CreateEnum
CREATE TYPE "CalendarEventSource" AS ENUM ('google', 'capture', 'manual');

-- CreateEnum
CREATE TYPE "NudgeTrigger" AS ENUM ('clustering', 'time_sensitive');

-- CreateTable
CREATE TABLE "captures" (
    "id" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "source" "CaptureSource" NOT NULL,
    "device_context" JSONB,
    "parse_status" "CaptureParseStatus",
    "parsed_actions" JSONB,
    "created_items" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "current_state" TEXT NOT NULL,
    "next_step" TEXT NOT NULL,
    "target_date" DATE,
    "slip_threshold_days" INTEGER NOT NULL DEFAULT 14,
    "parked_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "killed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_activity" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entry" TEXT NOT NULL,
    "state_snapshot" JSONB,
    "source" TEXT NOT NULL,
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "due_date" DATE,
    "due_time" TEXT,
    "priority" TEXT,
    "domain_id" TEXT NOT NULL,
    "project_id" TEXT,
    "parent_task_id" TEXT,
    "recurrence_rule" TEXT,
    "reminder_offsets" JSONB,
    "source" TEXT,
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "domain_id" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "IdeaStatus" NOT NULL DEFAULT 'seed',
    "converted_to_type" "ConvertedToType",
    "converted_to_id" TEXT,
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_notes" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "references" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domain_id" TEXT,
    "related_type" TEXT,
    "related_id" TEXT,
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "google_event_id" TEXT,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "synced_at" TIMESTAMP(3),
    "source" "CalendarEventSource" NOT NULL DEFAULT 'manual',
    "capture_id" TEXT,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "source_ref" JSONB,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "undo_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nudges" (
    "id" TEXT NOT NULL,
    "trigger" "NudgeTrigger" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "supporting_data" JSONB,
    "sent_at" TIMESTAMP(3),
    "acted_on" BOOLEAN,

    CONSTRAINT "nudges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "rate_limit_per_hour" INTEGER NOT NULL DEFAULT 60,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "capture_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "captures_created_at_idx" ON "captures"("created_at");

-- CreateIndex
CREATE INDEX "captures_parse_status_idx" ON "captures"("parse_status");

-- CreateIndex
CREATE UNIQUE INDEX "domains_name_key" ON "domains"("name");

-- CreateIndex
CREATE INDEX "domains_active_sort_order_idx" ON "domains"("active", "sort_order");

-- CreateIndex
CREATE INDEX "projects_domain_id_status_idx" ON "projects"("domain_id", "status");

-- CreateIndex
CREATE INDEX "projects_target_date_idx" ON "projects"("target_date");

-- CreateIndex
CREATE INDEX "project_activity_project_id_created_at_idx" ON "project_activity"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "project_activity_capture_id_idx" ON "project_activity"("capture_id");

-- CreateIndex
CREATE INDEX "tasks_domain_id_status_idx" ON "tasks"("domain_id", "status");

-- CreateIndex
CREATE INDEX "tasks_due_date_due_time_idx" ON "tasks"("due_date", "due_time");

-- CreateIndex
CREATE INDEX "tasks_project_id_idx" ON "tasks"("project_id");

-- CreateIndex
CREATE INDEX "tasks_capture_id_idx" ON "tasks"("capture_id");

-- CreateIndex
CREATE INDEX "ideas_domain_id_status_idx" ON "ideas"("domain_id", "status");

-- CreateIndex
CREATE INDEX "ideas_capture_id_idx" ON "ideas"("capture_id");

-- CreateIndex
CREATE INDEX "idea_notes_idea_id_created_at_idx" ON "idea_notes"("idea_id", "created_at");

-- CreateIndex
CREATE INDEX "idea_notes_capture_id_idx" ON "idea_notes"("capture_id");

-- CreateIndex
CREATE INDEX "references_domain_id_idx" ON "references"("domain_id");

-- CreateIndex
CREATE INDEX "references_capture_id_idx" ON "references"("capture_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_google_event_id_key" ON "calendar_events"("google_event_id");

-- CreateIndex
CREATE INDEX "calendar_events_start_end_idx" ON "calendar_events"("start", "end");

-- CreateIndex
CREATE INDEX "calendar_events_capture_id_idx" ON "calendar_events"("capture_id");

-- CreateIndex
CREATE INDEX "notifications_status_created_at_idx" ON "notifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "nudges_trigger_sent_at_idx" ON "nudges"("trigger", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "capture_tokens_token_hash_key" ON "capture_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "capture_tokens_revoked_at_idx" ON "capture_tokens"("revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_notes" ADD CONSTRAINT "idea_notes_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_notes" ADD CONSTRAINT "idea_notes_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity guardrails that Prisma cannot express directly.
CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletes are disabled for %. Use a status field instead.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER captures_no_delete BEFORE DELETE ON "captures"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER domains_no_delete BEFORE DELETE ON "domains"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER projects_no_delete BEFORE DELETE ON "projects"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER project_activity_no_delete BEFORE DELETE ON "project_activity"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER tasks_no_delete BEFORE DELETE ON "tasks"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER ideas_no_delete BEFORE DELETE ON "ideas"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER idea_notes_no_delete BEFORE DELETE ON "idea_notes"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER references_no_delete BEFORE DELETE ON "references"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER calendar_events_no_delete BEFORE DELETE ON "calendar_events"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER notifications_no_delete BEFORE DELETE ON "notifications"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER nudges_no_delete BEFORE DELETE ON "nudges"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER app_settings_no_delete BEFORE DELETE ON "app_settings"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

CREATE OR REPLACE FUNCTION prevent_capture_source_rewrite()
RETURNS trigger AS $$
BEGIN
  IF NEW."raw_text" IS DISTINCT FROM OLD."raw_text"
    OR NEW."source" IS DISTINCT FROM OLD."source"
    OR NEW."device_context" IS DISTINCT FROM OLD."device_context"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Capture source fields are append-only and cannot be rewritten.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER captures_no_source_rewrite BEFORE UPDATE ON "captures"
FOR EACH ROW EXECUTE FUNCTION prevent_capture_source_rewrite();

-- Full-text indexes. Search is an integrity feature, so raw and inactive records are indexed too.
CREATE INDEX "captures_fts_idx" ON "captures" USING GIN (
  to_tsvector('pg_catalog.english'::regconfig, COALESCE("raw_text", ''))
);

CREATE INDEX "tasks_fts_idx" ON "tasks" USING GIN (
  to_tsvector('pg_catalog.english'::regconfig, COALESCE("title", '') || ' ' || COALESCE("notes", ''))
);

CREATE INDEX "ideas_fts_idx" ON "ideas" USING GIN (
  to_tsvector('pg_catalog.english'::regconfig, COALESCE("title", '') || ' ' || COALESCE("body", ''))
);

CREATE INDEX "references_fts_idx" ON "references" USING GIN (
  to_tsvector('pg_catalog.english'::regconfig, COALESCE("body", '') || ' ' || COALESCE("url", ''))
);

CREATE INDEX "project_activity_fts_idx" ON "project_activity" USING GIN (
  to_tsvector('pg_catalog.english'::regconfig, COALESCE("entry", ''))
);
