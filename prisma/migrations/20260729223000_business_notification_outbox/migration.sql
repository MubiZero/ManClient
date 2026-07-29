CREATE TABLE "BusinessNotification" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingId" TEXT,
    "kind" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessNotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessNotification_businessId_deduplicationKey_key" ON "BusinessNotification"("businessId", "deduplicationKey");
CREATE INDEX "BusinessNotification_status_scheduledAt_idx" ON "BusinessNotification"("status", "scheduledAt");
CREATE INDEX "BusinessNotification_bookingId_kind_idx" ON "BusinessNotification"("bookingId", "kind");
CREATE UNIQUE INDEX "BusinessNotificationDelivery_notificationId_destinationId_key" ON "BusinessNotificationDelivery"("notificationId", "destinationId");
CREATE INDEX "BusinessNotificationDelivery_status_scheduledAt_idx" ON "BusinessNotificationDelivery"("status", "scheduledAt");

ALTER TABLE "BusinessNotification" ADD CONSTRAINT "BusinessNotification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessNotification" ADD CONSTRAINT "BusinessNotification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessNotificationDelivery" ADD CONSTRAINT "BusinessNotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "BusinessNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessNotificationDelivery" ADD CONSTRAINT "BusinessNotificationDelivery_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "BusinessTelegramChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
