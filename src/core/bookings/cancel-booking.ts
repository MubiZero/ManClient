import { prisma } from "@/core/database/prisma";

export type BookingActor =
  | { type: "customer"; customerId: string }
  | { type: "business"; businessId: string; membershipId: string };

export async function cancelBooking(input: { bookingId: string; actor: BookingActor }, now = new Date()) {
  const actorFilter = input.actor.type === "customer"
    ? { customerId: input.actor.customerId }
    : { businessId: input.actor.businessId };
  const result = await prisma.booking.updateMany({
    where: {
      id: input.bookingId,
      ...actorFilter,
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancelledBy: input.actor.type === "customer"
        ? `customer:${input.actor.customerId}`
        : `membership:${input.actor.membershipId}`,
    },
  });
  if (result.count !== 1) throw new Error("Booking does not exist or cannot be cancelled");
  return prisma.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
}
