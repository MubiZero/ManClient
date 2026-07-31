-- DropIndex
DROP INDEX "InboundChannelUpdate_status_claimedAt_idx";

-- AlterTable
ALTER TABLE "BusinessTelegramChat" ALTER COLUMN "chatType" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InboundChannelUpdate" ALTER COLUMN "updatedAt" DROP DEFAULT;
