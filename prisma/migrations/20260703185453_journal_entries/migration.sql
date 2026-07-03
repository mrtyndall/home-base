-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('typed', 'voice', 'import');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('active', 'killed');

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "body_md" TEXT NOT NULL,
    "source" "JournalSource" NOT NULL DEFAULT 'typed',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resurface_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "last_surfaced_at" TIMESTAMP(3),
    "capture_id" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_entries_status_entry_date_idx" ON "journal_entries"("status", "entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_capture_id_idx" ON "journal_entries"("capture_id");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Full-text indexes: search is an integrity feature, journal and check-ins included.
CREATE INDEX "journal_entries_fts_idx" ON "journal_entries" USING GIN (
  to_tsvector('pg_catalog.english'::regconfig, COALESCE("body_md", ''))
);

CREATE INDEX "check_ins_fts_idx" ON "check_ins" USING GIN (
  to_tsvector('pg_catalog.english'::regconfig, COALESCE("body_md", ''))
);
