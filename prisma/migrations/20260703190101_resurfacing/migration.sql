-- CreateEnum
CREATE TYPE "ResurfaceItemType" AS ENUM ('journal_entry', 'idea');

-- CreateEnum
CREATE TYPE "ResurfaceResponse" AS ENUM ('kept', 'dismissed', 'annotated');

-- AlterTable
ALTER TABLE "ideas" ADD COLUMN     "last_surfaced_at" TIMESTAMP(3),
ADD COLUMN     "resurface_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- CreateTable
CREATE TABLE "resurfacing_seen" (
    "id" TEXT NOT NULL,
    "item_type" "ResurfaceItemType" NOT NULL,
    "item_id" TEXT NOT NULL,
    "surfaced_on" DATE NOT NULL,
    "response" "ResurfaceResponse",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resurfacing_seen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resurfacing_seen_surfaced_on_idx" ON "resurfacing_seen"("surfaced_on");

-- CreateIndex
CREATE INDEX "resurfacing_seen_item_type_item_id_surfaced_on_idx" ON "resurfacing_seen"("item_type", "item_id", "surfaced_on");
