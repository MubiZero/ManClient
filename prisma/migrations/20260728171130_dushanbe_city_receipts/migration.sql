ALTER TABLE "Branch"
ADD COLUMN "recipientCardLast4" TEXT;

ALTER TABLE "Payment"
ADD COLUMN "isBankVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "operationAt" TIMESTAMP(3),
ADD COLUMN "operationNumber" TEXT,
ADD COLUMN "receiptAcceptedAt" TIMESTAMP(3),
ADD COLUMN "receiptAmountDiram" INTEGER,
ADD COLUMN "receiptStorageKey" TEXT,
ADD COLUMN "recipientCardSuffix" TEXT;

CREATE UNIQUE INDEX "Payment_businessId_operationNumber_key"
ON "Payment"("businessId", "operationNumber");
