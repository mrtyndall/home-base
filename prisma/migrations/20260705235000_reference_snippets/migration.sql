CREATE TABLE "reference_snippets" (
    "id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "provider_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'highlight',
    "quote" TEXT NOT NULL,
    "note" TEXT,
    "location" TEXT,
    "color" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "source_created_at" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_snippets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_snippets_provider_provider_id_key"
ON "reference_snippets"("provider", "provider_id");

CREATE INDEX "reference_snippets_reference_id_idx"
ON "reference_snippets"("reference_id");

CREATE INDEX "reference_snippets_kind_idx"
ON "reference_snippets"("kind");

CREATE INDEX "reference_snippets_starred_idx"
ON "reference_snippets"("starred");

ALTER TABLE "reference_snippets"
ADD CONSTRAINT "reference_snippets_reference_id_fkey"
FOREIGN KEY ("reference_id") REFERENCES "references"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
