-- A customer signing in to see their own visits: same code machinery as booking, different purpose,
-- so a code sent for a login can never be spent on a booking or the other way round.
ALTER TYPE "PhoneVerificationPurpose" ADD VALUE 'CUSTOMER_LOGIN';
