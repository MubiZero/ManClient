import type { BookingStatus, Prisma } from "@/generated/prisma/client";

import { firstChannelFor } from "@/core/notifications/channel-ladder";
import { prisma } from "@/core/database/prisma";
import { businessHasFeature } from "@/core/platform/subscription-plans";

type NotificationDatabase = Pick<Prisma.TransactionClient, "booking" | "message">;

/**
 * Scheduling a message to a customer. One row, one channel — see channel-ladder.ts for why sending
 * the same sentence over three channels was both rude and expensive.
 *
 * The channel chosen here is only where delivery *starts*. If it turns out the chat is gone or the
 * template was never approved, the delivery job walks down the ladder and writes the next row, so a
 * choice made now cannot leave a customer uninformed later.
 */

/**
 * The booking state a kind is about, where one was already enforced. Delivery checks this again at
 * send time — a booking cancelled between scheduling and sending must not produce a reminder — so
 * this is about not writing rows nobody will ever send, not about correctness of the send itself.
 */
const REQUIRED_STATUS: Record<string, BookingStatus | undefined> = {
  BOOKING_REMINDER: "CONFIRMED",
  BOOKING_CONFIRMATION: "CONFIRMED",
  REVIEW_REQUEST: "CONFIRMED",
  BOOKING_CANCELLED: "CANCELLED",
  PAYMENT_REJECTED: "PENDING_PAYMENT",
};

export type CustomerMessageKind =
  | "BOOKING_REMINDER"
  | "BOOKING_CONFIRMATION"
  | "BOOKING_CANCELLED"
  | "BOOKING_RESCHEDULED"
  | "REVIEW_REQUEST"
  | "PAYMENT_APPROVED"
  | "PAYMENT_REJECTED"
  | "PAYMENT_REMINDER"
  | "RECEIPT_NEEDS_REVIEW";

export async function scheduleCustomerMessage(
  input: { bookingId: string; kind: CustomerMessageKind; scheduledAt?: Date },
  database: NotificationDatabase = prisma,
) {
  const booking = await database.booking.findUnique({
    where: { id: input.bookingId },
    include: { customer: true, business: true },
  });
  if (!booking) return null;

  const required = REQUIRED_STATUS[input.kind];
  if (required && booking.status !== required) return null;
  // Reviews are a paid feature; the rest of the ladder does not ask about the plan because the plan
  // only ever gated SMS, and SMS asks for itself.
  if (input.kind === "REVIEW_REQUEST" && !businessHasFeature(booking.business, "REVIEWS")) return null;

  const channel = firstChannelFor({ kind: input.kind, customer: booking.customer, business: booking.business });
  if (!channel) return null;

  const scheduledAt = input.scheduledAt ?? new Date();
  return database.message.upsert({
    where: { bookingId_channel_kind: { bookingId: booking.id, channel, kind: input.kind } },
    create: { businessId: booking.businessId, bookingId: booking.id, channel, kind: input.kind, scheduledAt },
    update: { scheduledAt, status: "SCHEDULED", attempts: 0, lastError: null },
  });
}

/** A day before the visit, which is late enough to be useful and early enough to be actionable. */
export async function scheduleBookingReminder(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({ where: { id: bookingId }, select: { startsAt: true } });
  if (!booking) return null;
  return scheduleCustomerMessage(
    { bookingId, kind: "BOOKING_REMINDER", scheduledAt: new Date(booking.startsAt.getTime() - 24 * 60 * 60_000) },
    database,
  );
}

/** Two hours after the visit ends: long enough to have left, short enough to still remember it. */
export async function scheduleReviewRequest(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({ where: { id: bookingId }, select: { endsAt: true } });
  if (!booking) return null;
  return scheduleCustomerMessage(
    { bookingId, kind: "REVIEW_REQUEST", scheduledAt: new Date(booking.endsAt.getTime() + 2 * 60 * 60_000) },
    database,
  );
}
