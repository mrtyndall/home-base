-- Durable, role-isolated Codex worker jobs and reviewed learning records.
CREATE TYPE "AgentWorkerRole" AS ENUM ('sorter', 'assistant');
CREATE TYPE "AgentJobKind" AS ENUM ('capture_sort', 'assistant_turn');
CREATE TYPE "AgentJobStatus" AS ENUM ('queued', 'leased', 'retry_wait', 'succeeded', 'dead_letter');
CREATE TYPE "ChatMessageRole" AS ENUM ('user', 'assistant');
CREATE TYPE "ChatMessageStatus" AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE "CaptureRoutingFeedbackOutcome" AS ENUM ('accepted', 'corrected', 'dismissed');

ALTER TABLE "capture_review_proposals"
  ADD COLUMN "suggested_project_id" TEXT,
  ADD COLUMN "confidence" DOUBLE PRECISION,
  ADD COLUMN "prompt_version" TEXT,
  ADD COLUMN "agent_job_id" TEXT;

CREATE TABLE "chat_threads" (
  "id" TEXT NOT NULL,
  "title" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
  "id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "role" "ChatMessageRole" NOT NULL,
  "status" "ChatMessageStatus" NOT NULL DEFAULT 'completed',
  "content" TEXT NOT NULL,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_jobs" (
  "id" TEXT NOT NULL,
  "role" "AgentWorkerRole" NOT NULL,
  "kind" "AgentJobKind" NOT NULL,
  "status" "AgentJobStatus" NOT NULL DEFAULT 'queued',
  "idempotency_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_owner" TEXT,
  "lease_token_hash" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "model" TEXT,
  "prompt_version" TEXT,
  "capture_id" TEXT,
  "chat_message_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "agent_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_jobs_role_kind_check" CHECK (
    ("role" = 'sorter' AND "kind" = 'capture_sort')
    OR ("role" = 'assistant' AND "kind" = 'assistant_turn')
  )
);

CREATE TABLE "capture_routing_feedback" (
  "id" TEXT NOT NULL,
  "capture_id" TEXT NOT NULL,
  "proposal_id" TEXT,
  "outcome" "CaptureRoutingFeedbackOutcome" NOT NULL,
  "effective_text" TEXT NOT NULL,
  "effective_text_hash" TEXT NOT NULL,
  "proposed" JSONB,
  "final" JSONB,
  "eligible_as_example" BOOLEAN NOT NULL DEFAULT false,
  "reviewer" TEXT NOT NULL DEFAULT 'manual',
  "model" TEXT,
  "prompt_version" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "capture_routing_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "capture_review_proposals_agent_job_id_key" ON "capture_review_proposals"("agent_job_id");
CREATE INDEX "capture_review_proposals_suggested_project_id_idx" ON "capture_review_proposals"("suggested_project_id");
CREATE UNIQUE INDEX "chat_messages_thread_id_sequence_key" ON "chat_messages"("thread_id", "sequence");
CREATE INDEX "chat_messages_thread_id_created_at_idx" ON "chat_messages"("thread_id", "created_at");
CREATE UNIQUE INDEX "agent_jobs_idempotency_key_key" ON "agent_jobs"("idempotency_key");
CREATE UNIQUE INDEX "agent_jobs_chat_message_id_key" ON "agent_jobs"("chat_message_id");
CREATE INDEX "agent_jobs_role_status_available_at_created_at_idx" ON "agent_jobs"("role", "status", "available_at", "created_at");
CREATE INDEX "agent_jobs_capture_id_kind_status_idx" ON "agent_jobs"("capture_id", "kind", "status");
CREATE INDEX "capture_routing_feedback_capture_id_created_at_idx" ON "capture_routing_feedback"("capture_id", "created_at");
CREATE INDEX "capture_routing_feedback_eligible_as_example_created_at_idx" ON "capture_routing_feedback"("eligible_as_example", "created_at");
CREATE UNIQUE INDEX "capture_routing_feedback_proposal_id_key" ON "capture_routing_feedback"("proposal_id");

ALTER TABLE "capture_review_proposals" ADD CONSTRAINT "capture_review_proposals_suggested_project_id_fkey"
  FOREIGN KEY ("suggested_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "capture_review_proposals" ADD CONSTRAINT "capture_review_proposals_agent_job_id_fkey"
  FOREIGN KEY ("agent_job_id") REFERENCES "agent_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_capture_id_fkey"
  FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_chat_message_id_fkey"
  FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "capture_routing_feedback" ADD CONSTRAINT "capture_routing_feedback_capture_id_fkey"
  FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "capture_routing_feedback" ADD CONSTRAINT "capture_routing_feedback_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "capture_review_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Any terminal assistant job must atomically release its pending chat turn,
-- including claim-time input failures and final expired leases handled in SQL.
CREATE OR REPLACE FUNCTION reconcile_terminal_agent_job()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'dead_letter'
     AND OLD."status" IS DISTINCT FROM NEW."status"
     AND NEW."chat_message_id" IS NOT NULL THEN
    UPDATE "chat_messages"
    SET "status" = 'failed',
        "error" = 'The assistant could not complete this answer. Try again.',
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = NEW."chat_message_id"
      AND "role" = 'assistant'
      AND "status" = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reconcile_terminal_agent_job
AFTER UPDATE OF "status" ON "agent_jobs"
FOR EACH ROW EXECUTE FUNCTION reconcile_terminal_agent_job();

-- PostgreSQL owns atomic claims so concurrent workers never receive the same row.
CREATE OR REPLACE FUNCTION claim_agent_job(
  p_role "AgentWorkerRole",
  p_lease_hash TEXT,
  p_lease_owner TEXT,
  p_lease_seconds INTEGER
)
RETURNS SETOF "agent_jobs"
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "agent_jobs"
  SET "status" = 'dead_letter',
      "error" = COALESCE("error", 'Worker lease expired after the final attempt.'),
      "lease_owner" = NULL,
      "lease_expires_at" = NULL,
      "completed_at" = CURRENT_TIMESTAMP,
      "updated_at" = CURRENT_TIMESTAMP
  WHERE "attempt" >= "max_attempts"
    AND (
      ("status" = 'leased' AND "lease_expires_at" < CURRENT_TIMESTAMP)
      OR ("status" IN ('queued', 'retry_wait') AND "available_at" <= CURRENT_TIMESTAMP)
    );

  RETURN QUERY
  WITH next_job AS (
    SELECT "id"
    FROM "agent_jobs"
    WHERE "role" = p_role
      AND "attempt" < "max_attempts"
      AND (
        ("status" IN ('queued', 'retry_wait') AND "available_at" <= CURRENT_TIMESTAMP)
        OR ("status" = 'leased' AND "lease_expires_at" < CURRENT_TIMESTAMP)
      )
    ORDER BY "available_at" ASC, "created_at" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE "agent_jobs" AS job
  SET "status" = 'leased',
      "attempt" = job."attempt" + 1,
      "lease_owner" = p_lease_owner,
      "lease_token_hash" = p_lease_hash,
      "lease_expires_at" = CURRENT_TIMESTAMP + make_interval(secs => p_lease_seconds),
      "updated_at" = CURRENT_TIMESTAMP
  FROM next_job
  WHERE job."id" = next_job."id"
  RETURNING job.*;
END;
$$;

CREATE TRIGGER prevent_agent_jobs_delete BEFORE DELETE ON "agent_jobs"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER prevent_chat_threads_delete BEFORE DELETE ON "chat_threads"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER prevent_chat_messages_delete BEFORE DELETE ON "chat_messages"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER prevent_capture_routing_feedback_delete BEFORE DELETE ON "capture_routing_feedback"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

CREATE OR REPLACE FUNCTION prevent_capture_routing_feedback_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Capture routing feedback is immutable.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_capture_routing_feedback_update BEFORE UPDATE ON "capture_routing_feedback"
FOR EACH ROW EXECUTE FUNCTION prevent_capture_routing_feedback_update();
