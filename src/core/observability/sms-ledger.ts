import type { SmsChargePurpose } from "@/generated/prisma/client";
import { prisma } from "@/core/database/prisma";
import { logger } from "@/core/observability/logger";

/**
 * Records that the platform paid for one SMS. Called after the gateway accepted the message, from the
 * two places a message actually leaves: the bottom rung of the channel ladder, and a verification code.
 *
 * Kept apart from both tables that already know about an SMS, because neither can be billed against: a
 * `Message` is one row however many attempts reached payom, and a `PhoneVerification` is deleted a day
 * after its code dies. This row holds no phone and no hash, which is why it can be kept.
 */
export async function recordSmsCharge(
  input: { businessId?: string | null; purpose: SmsChargePurpose },
  now = new Date(),
): Promise<void> {
  try {
    await prisma.smsCharge.create({ data: { businessId: input.businessId ?? null, purpose: input.purpose, sentAt: now } });
  } catch (error) {
    // The message is already sent and the customer already has it. Losing a line of accounting is worth
    // strictly less than turning a delivered message into an error, so this only ever warns.
    logger.warn("sms_charge.record_failed", {
      businessId: input.businessId ?? undefined,
      purpose: input.purpose,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
