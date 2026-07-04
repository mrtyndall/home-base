-- Typed library references imported from Obsidian. Existing capture references stay intact.
ALTER TABLE "references" ADD COLUMN "title" TEXT;
ALTER TABLE "references" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'reference';
ALTER TABLE "references" ADD COLUMN "metadata" JSONB;
ALTER TABLE "references" ADD COLUMN "source_path" TEXT;

CREATE UNIQUE INDEX "references_source_path_key" ON "references"("source_path");
CREATE INDEX "references_kind_idx" ON "references"("kind");
