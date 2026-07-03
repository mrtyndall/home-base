-- CreateEnum
CREATE TYPE "ScheduledReviewStatus" AS ENUM ('pending', 'surfaced', 'done', 'dismissed');

-- CreateTable
CREATE TABLE "scheduled_reviews" (
    "id" TEXT NOT NULL,
    "capture_id" TEXT NOT NULL,
    "review_at" DATE,
    "condition_text" TEXT,
    "status" "ScheduledReviewStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_reviews_status_review_at_idx" ON "scheduled_reviews"("status", "review_at");

-- CreateIndex
CREATE INDEX "scheduled_reviews_capture_id_idx" ON "scheduled_reviews"("capture_id");

-- AddForeignKey
ALTER TABLE "scheduled_reviews" ADD CONSTRAINT "scheduled_reviews_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
