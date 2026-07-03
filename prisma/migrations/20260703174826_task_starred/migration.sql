-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "tasks_starred_status_idx" ON "tasks"("starred", "status");
