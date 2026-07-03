-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('active', 'retired');

-- CreateEnum
CREATE TYPE "InteractionSource" AS ENUM ('manual', 'calendar', 'capture');

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "attendees" JSONB;

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship_type" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "notes_md" TEXT,
    "area_id" TEXT,
    "status" "PersonStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_facts" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "fact_type" TEXT NOT NULL DEFAULT 'note',
    "fact_value" TEXT NOT NULL,
    "date_relevant" DATE,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_interactions" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "interaction_type" TEXT NOT NULL DEFAULT 'touchpoint',
    "notes_md" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "source" "InteractionSource" NOT NULL DEFAULT 'manual',
    "calendar_event_id" TEXT,
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "people_status_name_idx" ON "people"("status", "name");

-- CreateIndex
CREATE INDEX "people_email_idx" ON "people"("email");

-- CreateIndex
CREATE INDEX "person_facts_person_id_created_at_idx" ON "person_facts"("person_id", "created_at");

-- CreateIndex
CREATE INDEX "person_facts_date_relevant_idx" ON "person_facts"("date_relevant");

-- CreateIndex
CREATE INDEX "person_facts_capture_id_idx" ON "person_facts"("capture_id");

-- CreateIndex
CREATE INDEX "person_interactions_person_id_occurred_at_idx" ON "person_interactions"("person_id", "occurred_at");

-- CreateIndex
CREATE INDEX "person_interactions_calendar_event_id_idx" ON "person_interactions"("calendar_event_id");

-- CreateIndex
CREATE INDEX "person_interactions_capture_id_idx" ON "person_interactions"("capture_id");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_facts" ADD CONSTRAINT "person_facts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_facts" ADD CONSTRAINT "person_facts_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_interactions" ADD CONSTRAINT "person_interactions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_interactions" ADD CONSTRAINT "person_interactions_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
