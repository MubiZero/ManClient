import { prisma } from "@/core/database/prisma";

/**
 * Keeping a slot while the customer is paying for it.
 *
 * The hold is fifteen minutes, and the page asks the customer to leave for a banking app, make a
 * transfer and come back. Those fifteen minutes were therefore counted against somebody who was busy
 * doing exactly what we told them to — they returned with the money sent and found the slot given
 * away, which is the worst possible moment to lose a booking.
 *
 * Coming back to the page buys more time. Not unlimited time: a tab left open would otherwise hold a
 * chair all day, and the slot belongs to the salon, not to whoever opened the page first.
 */

/** How long a return to the page is worth. */
const EXTENSION_MINUTES = 15;

/** The longest a slot may be held from the moment it was booked, however often the page is opened. */
export const MAX_HOLD_MINUTES = 60;

/**
 * Pushes the hold out, and answers with the new deadline — or null when there is nothing to extend:
 * the booking was let go, it is already paid for, or it has been held as long as it may be.
 */
export async function extendPaymentHold(paymentId: string, now = new Date()): Promise<Date | null> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { bookingId: true, booking: { select: { status: true, createdAt: true, expiresAt: true } } },
  });
  if (!payment || payment.booking.status !== "PENDING_PAYMENT" || !payment.booking.expiresAt) return null;

  const ceiling = new Date(payment.booking.createdAt.getTime() + MAX_HOLD_MINUTES * 60_000);
  if (now.getTime() > ceiling.getTime()) return null;

  const extended = new Date(Math.min(now.getTime() + EXTENSION_MINUTES * 60_000, ceiling.getTime()));
  // Never shortens: a customer who returns twice in a minute must not lose the time the first return
  // bought them.
  if (extended.getTime() <= payment.booking.expiresAt.getTime()) return payment.booking.expiresAt;

  // Conditioned on the booking still waiting, so the sweep that expires overdue holds cannot lose a
  // race with a customer who came back at the same moment.
  const held = await prisma.booking.updateMany({
    where: { id: payment.bookingId, status: "PENDING_PAYMENT" },
    data: { expiresAt: extended },
  });
  return held.count === 1 ? extended : null;
}
