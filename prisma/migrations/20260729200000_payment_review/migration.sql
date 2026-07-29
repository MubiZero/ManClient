ALTER TYPE "PaymentStatus" ADD VALUE 'RECEIPT_PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE 'REJECTED';

ALTER TABLE "Payment"
  ADD COLUMN "attentionReason" TEXT,
  ADD COLUMN "reviewReason" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT;
