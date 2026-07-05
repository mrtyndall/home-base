ALTER TABLE "tasks" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "tasks_status_due_date_sort_order_idx" ON "tasks"("status", "due_date", "sort_order");
