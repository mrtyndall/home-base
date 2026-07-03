ALTER TABLE "projects" ALTER COLUMN "current_state" DROP NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "next_step" DROP NOT NULL;

UPDATE "projects"
SET "current_state" = NULL
WHERE "current_state" IN (
  'Created from Projects.',
  'Created through API.',
  'Created from capture. Current state needs detail.'
);

UPDATE "projects"
SET "next_step" = NULL
WHERE "next_step" = 'Define the next physical step.';
