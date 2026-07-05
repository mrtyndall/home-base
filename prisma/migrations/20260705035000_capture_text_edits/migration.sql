CREATE TABLE "capture_text_edits" (
  "id" TEXT NOT NULL,
  "capture_id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "capture_text_edits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "capture_text_edits_capture_id_created_at_idx" ON "capture_text_edits"("capture_id", "created_at");

ALTER TABLE "capture_text_edits"
  ADD CONSTRAINT "capture_text_edits_capture_id_fkey"
  FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
