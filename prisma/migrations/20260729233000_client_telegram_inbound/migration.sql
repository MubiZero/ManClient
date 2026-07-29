CREATE TYPE "InboundUpdateStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "InboundChannelUpdate"
  ADD COLUMN "status" "InboundUpdateStatus" NOT NULL DEFAULT 'PROCESSING',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "InboundChannelUpdate"
SET "status" = 'COMPLETED', "completedAt" = "receivedAt";

CREATE INDEX "InboundChannelUpdate_status_claimedAt_idx"
  ON "InboundChannelUpdate"("status", "claimedAt");
