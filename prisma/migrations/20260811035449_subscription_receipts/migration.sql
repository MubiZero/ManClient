-- CreateEnum
CREATE TYPE "SubscriptionReceiptStatus" AS ENUM ('ACCEPTED', 'NEEDS_REVIEW', 'REJECTED');

-- CreateTable
CREATE TABLE "SubscriptionReceipt" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "SubscriptionReceiptStatus" NOT NULL,
    "attentionReason" TEXT,
    "parsedOperationNumber" TEXT,
    "parsedAmountDiram" INTEGER,
    "parsedCardSuffix" TEXT,
    "parsedOperationAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionReceipt_parsedOperationNumber_key" ON "SubscriptionReceipt"("parsedOperationNumber");

-- CreateIndex
CREATE INDEX "SubscriptionReceipt_status_createdAt_idx" ON "SubscriptionReceipt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionReceipt_businessId_createdAt_idx" ON "SubscriptionReceipt"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionReceipt" ADD CONSTRAINT "SubscriptionReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SubscriptionInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionReceipt" ADD CONSTRAINT "SubscriptionReceipt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
