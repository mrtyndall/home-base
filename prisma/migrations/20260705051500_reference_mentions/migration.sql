CREATE TABLE "reference_mentions" (
    "id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_mentions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_mentions_source_type_source_id_target_type_target_id_key"
ON "reference_mentions"("source_type", "source_id", "target_type", "target_id");

CREATE INDEX "reference_mentions_source_type_source_id_status_idx"
ON "reference_mentions"("source_type", "source_id", "status");

CREATE INDEX "reference_mentions_target_type_target_id_status_idx"
ON "reference_mentions"("target_type", "target_id", "status");
