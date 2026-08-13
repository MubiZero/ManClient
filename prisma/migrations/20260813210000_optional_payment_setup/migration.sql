-- Records that a salon deliberately took no recipient card during onboarding. Businesses created before
-- this point kept their card step mandatory and all have one, so a null here reads correctly for them:
-- nothing was skipped.
ALTER TABLE "Business" ADD COLUMN "paymentSetupSkippedAt" TIMESTAMP(3);
