CREATE TYPE "CaptureStatus" AS ENUM ('active', 'dismissed');

ALTER TABLE "captures"
ADD COLUMN "status" "CaptureStatus" NOT NULL DEFAULT 'active';

CREATE INDEX "captures_status_parse_status_created_at_idx"
ON "captures"("status", "parse_status", "created_at");
