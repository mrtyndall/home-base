ALTER TABLE "tasks" ADD COLUMN "triaged_at" TIMESTAMP(3);

UPDATE "tasks" SET "triaged_at" = "updated_at" WHERE "triaged_at" IS NULL;

CREATE INDEX "tasks_open_inbox_triaged_idx"
ON "tasks" ("triaged_at", "sort_order", "updated_at")
WHERE "status" = 'open' AND "someday" = false
  AND "due_date" IS NULL AND "parent_task_id" IS NULL;
