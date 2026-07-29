import { prisma } from "@/core/database/prisma";

export async function expirePendingBookings(now = new Date()): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: {
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
