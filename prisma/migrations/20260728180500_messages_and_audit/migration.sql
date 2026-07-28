CREATE TYPE "MessageChannel" AS ENUM ('TELEGRAM', 'WHATSAPP');
CREATE TYPE "MessageStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

ALTER TABLE "Business"
ADD COLUMN "whatsappLanguageCode" TEXT NOT NULL DEFAULT 'ru',
ADD COLUMN "whatsappPhoneNumberId" TEXT,
ADD COLUMN "whatsappTemplateName" TEXT;

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "kind" TEXT NOT NULL,
  "status" "MessageStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "externalId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "bookingId" TEXT,
  "type" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Message_bookingId_channel_kind_key" ON "Message"("bookingId", "channel", "kind");
CREATE INDEX "Message_status_scheduledAt_idx" ON "Message"("status", "scheduledAt");
CREATE INDEX "Message_externalId_idx" ON "Message"("externalId");
CREATE INDEX "AuditEvent_businessId_createdAt_idx" ON "AuditEvent"("businessId", "createdAt");
CREATE INDEX "AuditEvent_bookingId_createdAt_idx" ON "AuditEvent"("bookingId", "createdAt");

ALTER TABLE "Message" ADD CONSTRAINT "Message_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
