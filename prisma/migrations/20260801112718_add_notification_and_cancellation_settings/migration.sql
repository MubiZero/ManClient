-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "cancellationPolicy" TEXT,
ADD COLUMN     "notifyOnCancellation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyOnNewBooking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyOnPaymentNeedsReview" BOOLEAN NOT NULL DEFAULT true;
