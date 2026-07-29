-- Separate the Telegram person who is authorised from the chat that receives messages.
CREATE TYPE "TelegramChatType" AS ENUM ('PRIVATE', 'GROUP', 'SUPERGROUP', 'CHANNEL');

CREATE TABLE "BusinessTelegramIdentity" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessTelegramIdentity_pkey" PRIMARY KEY ("id")
);

-- Earlier links could only be created from direct messages, where the chat id is
-- the Telegram user id. Retain them as private destinations during the split.
INSERT INTO "BusinessTelegramIdentity" ("id", "membershipId", "telegramUserId", "createdAt", "updatedAt")
SELECT 'legacy_' || "id", "membershipId", "chatId", "createdAt", "updatedAt"
FROM "BusinessTelegramChat";

ALTER TABLE "BusinessTelegramChat"
    ADD COLUMN "telegramIdentityId" TEXT,
    ADD COLUMN "chatType" "TelegramChatType" NOT NULL DEFAULT 'PRIVATE';

UPDATE "BusinessTelegramChat" AS chat
SET "telegramIdentityId" = identity."id"
FROM "BusinessTelegramIdentity" AS identity
WHERE identity."membershipId" = chat."membershipId"
  AND identity."telegramUserId" = chat."chatId";

ALTER TABLE "BusinessTelegramChat"
    ALTER COLUMN "telegramIdentityId" SET NOT NULL;

DROP INDEX "BusinessTelegramChat_membershipId_chatId_key";
ALTER TABLE "BusinessTelegramChat" DROP CONSTRAINT "BusinessTelegramChat_membershipId_fkey";
ALTER TABLE "BusinessTelegramChat" DROP COLUMN "membershipId";

CREATE UNIQUE INDEX "BusinessTelegramIdentity_membershipId_telegramUserId_key"
ON "BusinessTelegramIdentity"("membershipId", "telegramUserId");

CREATE INDEX "BusinessTelegramIdentity_telegramUserId_idx"
ON "BusinessTelegramIdentity"("telegramUserId");

CREATE UNIQUE INDEX "BusinessTelegramChat_telegramIdentityId_chatId_key"
ON "BusinessTelegramChat"("telegramIdentityId", "chatId");

ALTER TABLE "BusinessTelegramIdentity"
ADD CONSTRAINT "BusinessTelegramIdentity_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessTelegramChat"
ADD CONSTRAINT "BusinessTelegramChat_telegramIdentityId_fkey"
FOREIGN KEY ("telegramIdentityId") REFERENCES "BusinessTelegramIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
