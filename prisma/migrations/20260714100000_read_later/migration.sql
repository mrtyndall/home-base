ALTER TABLE "references"
ADD COLUMN "normalized_url" TEXT,
ADD COLUMN "read_at" TIMESTAMP(3),
ADD COLUMN "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "read_status" TEXT NOT NULL DEFAULT 'unread';

ALTER TABLE "references"
ADD CONSTRAINT "references_read_status_check"
CHECK ("read_status" IN ('unread', 'read', 'archived'));

CREATE INDEX "references_kind_read_status_saved_at_idx"
ON "references"("kind", "read_status", "saved_at");

-- Null normalized URLs keep all pre-existing References outside this
-- constraint. Archived entries are history and may be saved again later.
CREATE UNIQUE INDEX "references_active_read_later_normalized_url_key"
ON "references"("normalized_url")
WHERE "kind" = 'read_later'
  AND "normalized_url" IS NOT NULL
  AND "read_status" IN ('unread', 'read');
