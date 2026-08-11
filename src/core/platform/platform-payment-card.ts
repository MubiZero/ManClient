import { logger } from "@/core/observability/logger";

/**
 * The card the platform is paid on, read from the environment and never stored — the same rule the
 * businesses' own cards follow, one step stricter: this one has no database row at all.
 *
 * Optional on purpose. While it is unset, self-service payment is simply not offered and the cabinet
 * says an operator takes the payment — the same way password recovery over SMS stays off until the
 * payom template exists, rather than showing a button that cannot work.
 */
export function platformPaymentCard(): string | null {
  const value = process.env.PLATFORM_PAYMENT_CARD?.trim();
  if (!value) return null;
  if (!/^\d{16,19}$/.test(value)) {
    // Logged without the value: a malformed card number is still a card number.
    logger.warn("platform.payment_card_invalid", { length: value.length });
    return null;
  }
  return value;
}
