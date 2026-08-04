import { prisma } from "@/core/database/prisma";

/**
 * `scope` narrows the sweep to a single business. Production leaves it unset: the scheduler is one
 * process draining the whole table, which is the point. Tests set it because the suite runs files in
 * parallel against one database, and an unscoped sweep expires bookings another file is mid-way
 * through asserting on.
 */
export async function expirePendingBookings(now = new Date(), scope?: { businessId: string }): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: {
      ...(scope ? { businessId: scope.businessId } : {}),
      status: "PENDING_PAYMENT",
      expiresAt: { lte: now },
      OR: [
        { payment: null },
        { payment: { is: { reviewDeadline: null } } },
        { payment: { is: { reviewDeadline: { lte: now } } } },
      ],
    },
    data: { status: "EXPIRED" },
  });

  return result.count;
}
