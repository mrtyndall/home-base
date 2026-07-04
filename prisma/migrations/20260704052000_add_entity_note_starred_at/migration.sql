-- Add manual starring support for shared area/project notes.
ALTER TABLE "entity_notes" ADD COLUMN "starred_at" TIMESTAMP(3);

CREATE INDEX "entity_notes_parent_type_parent_id_starred_at_idx" ON "entity_notes"("parent_type", "parent_id", "starred_at");
