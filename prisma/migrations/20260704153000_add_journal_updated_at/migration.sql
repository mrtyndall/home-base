-- Track journal edits without changing the original capture ledger.
ALTER TABLE "journal_entries" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
