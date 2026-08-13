-- Ties a verification code to the salon that asked for it. Nullable: account recovery belongs to no one
-- salon, and codes already in flight when this ships have no business to name. The gate reads a null as
-- "not scoped" and keeps accepting those, so nobody's half-finished booking breaks on deploy.
ALTER TABLE "PhoneVerification" ADD COLUMN "businessId" TEXT;

ALTER TABLE "PhoneVerification"
  ADD CONSTRAINT "PhoneVerification_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every code costs an SMS; this is the index that answers how many a given salon has spent.
CREATE INDEX "PhoneVerification_businessId_createdAt_idx" ON "PhoneVerification"("businessId", "createdAt");
