ALTER TABLE "Customer"
ADD COLUMN "telegramChatId" TEXT;

CREATE UNIQUE INDEX "Customer_businessId_telegramChatId_key"
ON "Customer"("businessId", "telegramChatId");
