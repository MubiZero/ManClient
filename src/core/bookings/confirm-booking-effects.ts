import type { Prisma } from "@/generated/prisma/client";

import { scheduleBusinessNotification, scheduleUpcomingBusinessVisit } from "@/core/notifications/business-notification-service";
import { scheduleBookingReminder, scheduleCustomerMessage, scheduleReviewRequest } from "@/core/notifications/notification-service";

/**
 * Everything that has to happen once a visit is certain: the customer is told, reminded and later asked
 * for a review, and the business sees it in its own feed. This used to live only inside the receipt
 * handler, which was fine while an accepted receipt was the only way a booking could become confirmed.
 * A business that asks for no prepayment confirms bookings on creation instead, and it must not quietly
 * lose its reminders because it stopped taking money up front.
 */
export async function scheduleConfirmationEffects(
  input: {
    businessId: string;
    bookingId: string;
    startsAt: Date;
    /** Distinguishes "we received your money" from "your booking is simply confirmed". */
    notificationKind: "PAYMENT_APPROVED" | "BOOKING_CONFIRMED";
    /** Kept caller-supplied so existing feeds are not deduplicated against a new key shape. */
    deduplicationKey: string;
  },
  transaction: Prisma.TransactionClient,
  now = new Date(),
): Promise<void> {
  await scheduleBookingReminder(input.bookingId, transaction);
  await scheduleReviewRequest(input.bookingId, transaction);
  // One message per event, not one per channel: "we received your money" and "your booking is
  // confirmed" are the same news to the customer, and the notification kind already says which of the
  // two wordings they get.
  await scheduleCustomerMessage(
    { bookingId: input.bookingId, kind: input.notificationKind === "PAYMENT_APPROVED" ? "PAYMENT_APPROVED" : "BOOKING_CONFIRMATION", scheduledAt: now },
    transaction,
  );
  await scheduleBusinessNotification({
    businessId: input.businessId,
    bookingId: input.bookingId,
    kind: input.notificationKind,
    deduplicationKey: input.deduplicationKey,
    scheduledAt: now,
  }, transaction);
  await scheduleUpcomingBusinessVisit({ businessId: input.businessId, bookingId: input.bookingId, startsAt: input.startsAt }, transaction);
}
