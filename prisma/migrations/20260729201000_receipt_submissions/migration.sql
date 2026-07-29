CREATE TYPE "ReceiptSubmissionStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'ACCEPTED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED');

ALTER TABLE "Payment" ADD COLUMN "reviewDeadline" TIMESTAMP(3);

CREATE TABLE "ReceiptSubmission" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "status" "ReceiptSubmissionStatus" NOT NULL DEFAULT 'UPLOADED',
  "parsedOperationNumber" TEXT,
  "parsedAmountDiram" INTEGER,
  "parsedCardSuffix" TEXT,
  "parsedOperationAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReceiptSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReceiptSubmission_storageKey_key" ON "ReceiptSubmission"("storageKey");
CREATE INDEX "ReceiptSubmission_businessId_status_createdAt_idx" ON "ReceiptSubmission"("businessId", "status", "createdAt");
CREATE INDEX "ReceiptSubmission_paymentId_createdAt_idx" ON "ReceiptSubmission"("paymentId", "createdAt");
ALTER TABLE "ReceiptSubmission" ADD CONSTRAINT "ReceiptSubmission_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceiptSubmission" ADD CONSTRAINT "ReceiptSubmission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
