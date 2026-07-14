ALTER TABLE "areas" ADD COLUMN "parent_area_id" TEXT;

CREATE INDEX "areas_parent_area_id_status_sort_order_idx"
ON "areas"("parent_area_id", "status", "sort_order");

ALTER TABLE "areas"
ADD CONSTRAINT "areas_parent_area_id_fkey"
FOREIGN KEY ("parent_area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "projects" DROP CONSTRAINT "projects_area_id_fkey";
ALTER TABLE "projects" ALTER COLUMN "area_id" DROP NOT NULL;
ALTER TABLE "projects"
ADD CONSTRAINT "projects_area_id_fkey"
FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
