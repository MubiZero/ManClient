import type { PhoneVerificationPurpose } from "@/generated/prisma/client";
import { prisma } from "@/core/database/prisma";
import { logger, maskPhone } from "@/core/observability/logger";
import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";
import { consumeVerifiedPhone, isPhoneVerificationRequired, PhoneVerificationError } from "@/core/security/phone-verification-service";

/**
 * The gate the three public web entry points share — booking, recurring booking, waitlist. It lives
 * apart from the service because the *rule* is web-specific: a booking made inside a business's
 * Telegram bot already proves phone ownership through the chat, and asking that customer for an SMS
 * code would be a regression, not a hardening.
 *
 * Checking and spending are two calls on purpose. Spending the code before the booking exists would
 * make a lost race for a slot cost the customer a second SMS; spending it after leaves a sub-second
 * window where one code could produce two bookings, which is the cheaper of the two problems.
 */

export async function assertPhoneVerified(
  input: {
    phone: string;
    verificationId?: string | null;
    purpose?: PhoneVerificationPurpose;
    /** The number this browser already proved by signing in, if any. */
    sessionPhone?: string | null;
  },
  now = new Date(),
): Promise<void> {
  if (!isPhoneVerificationRequired()) return;

  const phone = normalizeTajikPhone(input.phone);
  if (!phone) throw new PhoneVerificationError("INVALID_PHONE");
  // A signed-in customer booking under their own number has already answered an SMS for this browser.
  // Asking again would charge us a second message to learn the same fact, and cost the customer the
  // step that the sign-in was meant to remove.
  if (input.sessionPhone && normalizeTajikPhone(input.sessionPhone) === phone) return;
  if (!input.verificationId) throw new PhoneVerificationError("VERIFICATION_REQUIRED");

  const verification = await prisma.phoneVerification.findUnique({ where: { id: input.verificationId } });
  if (
    !verification ||
    verification.phone !== phone ||
    verification.purpose !== (input.purpose ?? "BOOKING") ||
    verification.status !== "VERIFIED" ||
    verification.expiresAt <= now
  ) {
    throw new PhoneVerificationError("VERIFICATION_REQUIRED");
  }
}

/** Best effort: the booking already exists, so a failure here must not turn into an error response. */
export async function spendPhoneVerification(
  input: { phone: string; verificationId?: string | null; purpose?: PhoneVerificationPurpose },
  now = new Date(),
): Promise<void> {
  if (!isPhoneVerificationRequired() || !input.verificationId) return;
  const phone = normalizeTajikPhone(input.phone);
  if (!phone) return;

  try {
    await consumeVerifiedPhone({ verificationId: input.verificationId, phone, purpose: input.purpose ?? "BOOKING" }, now);
  } catch (error) {
    logger.warn("phone_verification.consume_failed", {
      phone: maskPhone(phone),
      verificationId: input.verificationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
