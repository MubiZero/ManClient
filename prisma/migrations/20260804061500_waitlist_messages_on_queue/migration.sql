
-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "waitlistEntryId" TEXT,
ALTER COLUMN "bookingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN     "freedStartsAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Message_waitlistEntryId_channel_kind_key" ON "Message"("waitlistEntryId", "channel", "kind");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_waitlistEntryId_fkey" FOREIGN KEY ("waitlistEntryId") REFERENCES "WaitlistEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

