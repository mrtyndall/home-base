-- CreateEnum
CREATE TYPE "CaptureReviewProposalStatus" AS ENUM ('pending', 'accepted', 'dismissed', 'snoozed');

-- CreateTable
CREATE TABLE "capture_review_proposals" (
    "id" TEXT NOT NULL,
    "capture_id" TEXT NOT NULL,
    "status" "CaptureReviewProposalStatus" NOT NULL DEFAULT 'pending',
    "suggested_type" TEXT NOT NULL,
    "suggested_area_id" TEXT,
    "reason" TEXT,
    "model" TEXT,
    "snoozed_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "capture_review_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capture_review_proposals_status_snoozed_until_created_at_idx"
ON "capture_review_proposals"("status", "snoozed_until", "created_at");

-- CreateIndex
CREATE INDEX "capture_review_proposals_capture_id_status_idx"
ON "capture_review_proposals"("capture_id", "status");

-- CreateIndex
CREATE INDEX "capture_review_proposals_suggested_area_id_idx"
ON "capture_review_proposals"("suggested_area_id");

-- AddForeignKey
ALTER TABLE "capture_review_proposals"
ADD CONSTRAINT "capture_review_proposals_capture_id_fkey"
FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_review_proposals"
ADD CONSTRAINT "capture_review_proposals_suggested_area_id_fkey"
FOREIGN KEY ("suggested_area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
