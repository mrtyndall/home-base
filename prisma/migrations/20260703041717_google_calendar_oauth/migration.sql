-- AlterTable
ALTER TABLE "calendar_events" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "calendar_oauth_tokens" (
    "id" TEXT NOT NULL DEFAULT 'google-primary',
    "provider" TEXT NOT NULL DEFAULT 'google',
    "calendar_id" TEXT NOT NULL DEFAULT 'primary',
    "refresh_token_ciphertext" TEXT NOT NULL,
    "refresh_token_iv" TEXT NOT NULL,
    "refresh_token_tag" TEXT NOT NULL,
    "scope" TEXT,
    "token_type" TEXT,
    "expiry_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- Integrity guardrail for encrypted OAuth token rows.
CREATE TRIGGER calendar_oauth_tokens_no_delete BEFORE DELETE ON "calendar_oauth_tokens"
FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
