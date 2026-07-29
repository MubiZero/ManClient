CREATE TYPE "BookingSource" AS ENUM ('WEB', 'TELEGRAM', 'DASHBOARD');

ALTER TABLE "Booking"
  ADD COLUMN "source" "BookingSource" NOT NULL DEFAULT 'WEB',
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ALTER COLUMN "expiresAt" DROP NOT NULL;

UPDATE "Booking" AS booking
SET "confirmedAt" = payment."receiptAcceptedAt",
    "confirmedBy" = CASE WHEN payment."receiptAcceptedAt" IS NOT NULL THEN 'receipt' ELSE NULL END
FROM "Payment" AS payment
WHERE payment."bookingId" = booking."id"
  AND booking."status" = 'CONFIRMED';
