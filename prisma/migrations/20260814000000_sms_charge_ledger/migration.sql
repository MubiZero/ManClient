-- What a month of SMS cost, and for whom. Neither existing table can answer that: a Message holds one
-- row however many attempts reached the gateway, and a PhoneVerification is deleted a day after its code
-- dies. This ledger carries no phone and no code hash, so keeping it costs nothing in liability.
CREATE TYPE "SmsChargePurpose" AS ENUM ('NOTIFICATION', 'VERIFICATION');

CREATE TABLE "SmsCharge" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "purpose" "SmsChargePurpose" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsCharge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsCharge_businessId_sentAt_idx" ON "SmsCharge"("businessId", "sentAt");
CREATE INDEX "SmsCharge_sentAt_idx" ON "SmsCharge"("sentAt");

-- SET NULL rather than CASCADE: a business that leaves does not un-spend the money it cost.
ALTER TABLE "SmsCharge"
  ADD CONSTRAINT "SmsCharge_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
