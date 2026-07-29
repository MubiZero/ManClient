import { Prisma } from "@/generated/prisma/client";

import { BookingConflictError } from "@/core/bookings/booking-allocation";
import { getAvailableStarts } from "@/core/availability/availability-service";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { scheduleCustomerTelegramNotification } from "@/core/notifications/customer-telegram-notification-service";

type RescheduleBookingInput = { bookingId: string; customerId: string; startsAt: Date };

export async function rescheduleBooking(input: RescheduleBookingInput) {
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, customerId: input.customerId, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
    include: { service: true, resources: true },
  });
  if (!booking) throw new Error("Booking does not exist or cannot be rescheduled");

  const endsAt = new Date(input.startsAt.getTime() + booking.service.durationMinutes * 60_000);
  const availableStarts = await getAvailableStarts({
    branchId: booking.branchId,
    serviceId: booking.serviceId,
    staffId: booking.staffId,
    resourceIds: booking.resources.map(({ resourceId }) => resourceId),
    rangeStartsAt: input.startsAt,
    rangeEndsAt: endsAt,
    durationMinutes: booking.service.durationMinutes,
    intervalMinutes: booking.service.durationMinutes,
    excludeBookingId: booking.id,
  });
  if (availableStarts.length !== 1) throw new BookingConflictError("STAFF_UNAVAILABLE");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const current = await transaction.booking.findFirst({
          where: { id: booking.id, customerId: input.customerId, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
          include: { resources: true },
        });
        if (!current) throw new Error("Booking does not exist or cannot be rescheduled");

        const resourceIds = current.resources.map(({ resourceId }) => resourceId);
        const conflict = await transaction.booking.findFirst({
          where: {
            id: { not: current.id },
            branchId: current.branchId,
            status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
            startsAt: { lt: endsAt },
            endsAt: { gt: input.startsAt },
            OR: [
              { staffId: current.staffId },
              ...(resourceIds.length ? [{ resources: { some: { resourceId: { in: resourceIds } } } }] : []),
            ],
          },
          include: { resources: true },
        });
        if (conflict) {
          const resourceConflict = conflict.resources.some(({ resourceId }) => resourceIds.includes(resourceId));
          throw new BookingConflictError(resourceConflict ? "RESOURCE_UNAVAILABLE" : "STAFF_UNAVAILABLE");
        }

        const updated = await transaction.booking.update({ where: { id: current.id }, data: { startsAt: input.startsAt, endsAt } });
        await writeAuditEvent({
          businessId: current.businessId,
          bookingId: current.id,
          type: "booking.rescheduled",
          actorType: "customer",
          actorId: input.customerId,
          metadata: { previousStartsAt: current.startsAt.toISOString(), startsAt: input.startsAt.toISOString() },
        }, transaction);
        await scheduleCustomerTelegramNotification({ bookingId: current.id, kind: "BOOKING_RESCHEDULED" }, transaction);
        return updated;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }

  throw new BookingConflictError("STAFF_UNAVAILABLE");
}
