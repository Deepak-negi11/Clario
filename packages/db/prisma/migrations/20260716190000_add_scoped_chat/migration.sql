CREATE TYPE "ChatScope" AS ENUM ('General', 'Room');

ALTER TABLE "ChatMessage"
  ADD COLUMN "scope" "ChatScope" NOT NULL DEFAULT 'General',
  ADD COLUMN "roomId" TEXT;

DROP INDEX IF EXISTS "ChatMessage_spaceId_createdAt_idx";
CREATE INDEX "ChatMessage_spaceId_scope_roomId_createdAt_idx"
  ON "ChatMessage"("spaceId", "scope", "roomId", "createdAt");
