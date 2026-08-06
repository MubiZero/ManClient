-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "rescheduleCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "freeCancellationHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxAdvanceDays" INTEGER,
ADD COLUMN     "maxCustomerReschedules" INTEGER,
ADD COLUMN     "minLeadTimeMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0;
