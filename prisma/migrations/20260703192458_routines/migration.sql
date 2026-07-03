-- CreateEnum
CREATE TYPE "RoutineStatus" AS ENUM ('active', 'paused', 'retired');

-- CreateTable
CREATE TABLE "routines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "area_id" TEXT,
    "schedule" JSONB NOT NULL,
    "goal" JSONB,
    "grace_window" JSONB,
    "temporary" BOOLEAN NOT NULL DEFAULT false,
    "start_date" DATE,
    "end_date" DATE,
    "status" "RoutineStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_completions" (
    "id" TEXT NOT NULL,
    "routine_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" TEXT,

    CONSTRAINT "routine_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routines_status_idx" ON "routines"("status");

-- CreateIndex
CREATE INDEX "routines_area_id_idx" ON "routines"("area_id");

-- CreateIndex
CREATE INDEX "routine_completions_routine_id_completed_at_idx" ON "routine_completions"("routine_id", "completed_at");

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_completions" ADD CONSTRAINT "routine_completions_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
