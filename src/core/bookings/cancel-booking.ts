import { prisma } from "@/core/database/prisma";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { scheduleCustomerTelegramNotification } from "@/core/notifications/customer-telegram-notification-service";
import { scheduleWhatsAppCancellation } from "@/core/notifications/notification-service";

export type BookingActor =
  | { type: "customer"; customerId: string }
  | { type: "business"; businessId: string; membershipId: string };

export async function cancelBooking(input: { bookingId: string; actor: BookingActor }, now = new Date()) {
  const actorFilter = input.actor.type === "customer"
    ? { customerId: input.actor.customerId }
    : { businessId: input.actor.businessId };
  return prisma.$transaction(async (transaction) => {
    const result = await transaction.booking.updateMany({
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
    const booking = await transaction.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
    await writeAuditEvent({
      businessId: booking.businessId,
      bookingId: booking.id,
      type: "booking.cancelled",
      actorType: input.actor.type,
      actorId: input.actor.type === "customer" ? input.actor.customerId : input.actor.membershipId,
      metadata: { cancelledAt: now.toISOString() },
    }, transaction);
    await scheduleCustomerTelegramNotification({ bookingId: booking.id, kind: "BOOKING_CANCELLED", scheduledAt: now }, transaction);
    await scheduleWhatsAppCancellation(booking.id, transaction);
    return booking;
  });
}
