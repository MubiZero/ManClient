CREATE TYPE "TelegramConnectionMethod" AS ENUM ('TOKEN', 'MANAGED');
CREATE TYPE "ManagedBotConnectionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'FAILED');

ALTER TABLE "BusinessTelegramIntegration"
  ADD COLUMN "connectionMethod" "TelegramConnectionMethod" NOT NULL DEFAULT 'TOKEN',
  ADD COLUMN "managedOwnerTelegramUserId" TEXT,
  ADD COLUMN "managedAt" TIMESTAMP(3);

CREATE TABLE "ManagedBotConnectionIntent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "suggestedUsername" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" "ManagedBotConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "botId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagedBotConnectionIntent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagedBotConnectionIntent_membershipId_status_expiresAt_idx"
  ON "ManagedBotConnectionIntent"("membershipId", "status", "expiresAt");
CREATE INDEX "ManagedBotConnectionIntent_telegramUserId_status_expiresAt_idx"
  ON "ManagedBotConnectionIntent"("telegramUserId", "status", "expiresAt");
CREATE INDEX "ManagedBotConnectionIntent_botId_idx" ON "ManagedBotConnectionIntent"("botId");

ALTER TABLE "ManagedBotConnectionIntent"
  ADD CONSTRAINT "ManagedBotConnectionIntent_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagedBotConnectionIntent"
  ADD CONSTRAINT "ManagedBotConnectionIntent_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
