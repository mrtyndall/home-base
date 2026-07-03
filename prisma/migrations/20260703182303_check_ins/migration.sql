-- CreateEnum
CREATE TYPE "CheckInSource" AS ENUM ('manual', 'ai_draft', 'ai_draft_edited', 'voice');

-- CreateTable
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "parent_type" "EntityParentType" NOT NULL,
    "parent_id" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "source" "CheckInSource" NOT NULL DEFAULT 'manual',
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "check_ins_parent_type_parent_id_created_at_idx" ON "check_ins"("parent_type", "parent_id", "created_at");

-- CreateIndex
CREATE INDEX "check_ins_capture_id_idx" ON "check_ins"("capture_id");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration (lossless, additive): existing current_state/next_step values
-- become each project's and area's first check-in. Columns are retained.
INSERT INTO "check_ins" ("id", "parent_type", "parent_id", "body_md", "source", "created_at")
SELECT
    gen_random_uuid(),
    'project'::"EntityParentType",
    p."id",
    btrim(
        COALESCE(NULLIF(btrim(p."current_state"), ''), '')
        || CASE
            WHEN NULLIF(btrim(p."current_state"), '') IS NOT NULL
                 AND NULLIF(btrim(p."next_step"), '') IS NOT NULL
            THEN E'\n\n'
            ELSE ''
        END
        || CASE
            WHEN NULLIF(btrim(p."next_step"), '') IS NOT NULL
            THEN 'Next step: ' || btrim(p."next_step")
            ELSE ''
        END
    ),
    'manual'::"CheckInSource",
    CURRENT_TIMESTAMP
FROM "projects" p
WHERE NULLIF(btrim(p."current_state"), '') IS NOT NULL
   OR NULLIF(btrim(p."next_step"), '') IS NOT NULL;

INSERT INTO "check_ins" ("id", "parent_type", "parent_id", "body_md", "source", "created_at")
SELECT
    gen_random_uuid(),
    'area'::"EntityParentType",
    a."id",
    btrim(
        COALESCE(NULLIF(btrim(a."current_state"), ''), '')
        || CASE
            WHEN NULLIF(btrim(a."current_state"), '') IS NOT NULL
                 AND NULLIF(btrim(a."next_step"), '') IS NOT NULL
            THEN E'\n\n'
            ELSE ''
        END
        || CASE
            WHEN NULLIF(btrim(a."next_step"), '') IS NOT NULL
            THEN 'Next step: ' || btrim(a."next_step")
            ELSE ''
        END
    ),
    'manual'::"CheckInSource",
    CURRENT_TIMESTAMP
FROM "areas" a
WHERE NULLIF(btrim(a."current_state"), '') IS NOT NULL
   OR NULLIF(btrim(a."next_step"), '') IS NOT NULL;
