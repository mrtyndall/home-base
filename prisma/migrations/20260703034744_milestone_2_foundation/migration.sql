/*
  Warnings:

  - Existing rows receive CURRENT_TIMESTAMP for new `updated_at` columns.

*/
-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('pushover', 'in_app');

-- CreateEnum
CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('sent', 'failed');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('ok', 'stale', 'failed', 'not_configured');

-- AlterEnum
ALTER TYPE "CalendarEventSource" ADD VALUE 'api';

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "google_calendar_id" TEXT,
ADD COLUMN     "google_etag" TEXT,
ADD COLUMN     "google_updated_at" TIMESTAMP(3),
ADD COLUMN     "last_pulled_at" TIMESTAMP(3),
ADD COLUMN     "last_pushed_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'confirmed',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "idea_notes" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "ideas" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "references" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "reminder_deliveries" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "offset_minutes" INTEGER NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_status" "ReminderDeliveryStatus" NOT NULL,
    "error" TEXT,

    CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "rate_limit" INTEGER NOT NULL DEFAULT 60,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_sync_states" (
    "id" TEXT NOT NULL DEFAULT 'google-primary',
    "provider" TEXT NOT NULL DEFAULT 'google',
    "calendar_id" TEXT,
    "sync_token" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_successful_sync_at" TIMESTAMP(3),
    "status" "CalendarSyncStatus" NOT NULL DEFAULT 'not_configured',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_deliveries_sent_at_idx" ON "reminder_deliveries"("sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_deliveries_task_id_offset_minutes_channel_key" ON "reminder_deliveries"("task_id", "offset_minutes", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_token_hash_key" ON "api_keys"("token_hash");

-- CreateIndex
CREATE INDEX "api_keys_revoked_at_idx" ON "api_keys"("revoked_at");

-- CreateIndex
CREATE INDEX "calendar_events_google_calendar_id_synced_at_idx" ON "calendar_events"("google_calendar_id", "synced_at");

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity guardrails for Milestone 2 tables.
CREATE TRIGGER reminder_deliveries_no_delete BEFORE DELETE ON "reminder_deliveries"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

CREATE TRIGGER api_keys_no_delete BEFORE DELETE ON "api_keys"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

CREATE TRIGGER calendar_sync_states_no_delete BEFORE DELETE ON "calendar_sync_states"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
