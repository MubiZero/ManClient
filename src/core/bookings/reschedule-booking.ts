import { Prisma } from "@/generated/prisma/client";

import { BookingConflictError } from "@/core/bookings/booking-allocation";
import { findBlockingBooking } from "@/core/availability/booking-window";
import { assertCustomerMayReschedule, getCustomerBookingPolicy } from "@/core/bookings/booking-policy";
import { getAvailableStarts } from "@/core/availability/availability-service";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { scheduleCustomerMessage } from "@/core/notifications/notification-service";

type RescheduleBookingInput = { bookingId: string; customerId: string; startsAt: Date };

export async function rescheduleBooking(input: RescheduleBookingInput, now = new Date()) {
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, customerId: input.customerId, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
    include: { service: true, resources: true },
  });
  if (!booking) throw new Error("Booking does not exist or cannot be rescheduled");

  // Checked before the slot search so that a customer past the window is told why, rather than being
  // shown an unhelpful "this time is unavailable" for every time they try.
  const policy = await getCustomerBookingPolicy(booking.businessId);
  assertCustomerMayReschedule(policy, booking, now);

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
    actor: "customer",
    now,
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
        const conflict = await findBlockingBooking(
          {
            branchId: current.branchId,
            staffId: current.staffId,
            resourceIds,
            rangeStartsAt: input.startsAt,
            rangeEndsAt: endsAt,
            startsAt: input.startsAt,
            endsAt,
            buffers: booking.service,
            excludeBookingId: current.id,
          },
          transaction,
        );
        if (conflict) {
          const resourceConflict = conflict.resourceIds.some((resourceId) => resourceIds.includes(resourceId));
          throw new BookingConflictError(resourceConflict ? "RESOURCE_UNAVAILABLE" : "STAFF_UNAVAILABLE");
        }

        const updated = await transaction.booking.update({
          where: { id: current.id },
          // The counter is what the reschedule limit reads, and only customer moves increment it.
          data: { startsAt: input.startsAt, endsAt, rescheduleCount: { increment: 1 } },
        });
        await writeAuditEvent({
          businessId: current.businessId,
          bookingId: current.id,
          type: "booking.rescheduled",
          actorType: "customer",
          actorId: input.customerId,
          metadata: { previousStartsAt: current.startsAt.toISOString(), startsAt: input.startsAt.toISOString() },
        }, transaction);
        await scheduleCustomerMessage({ bookingId: current.id, kind: "BOOKING_RESCHEDULED" }, transaction);
        return updated;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }

  throw new BookingConflictError("STAFF_UNAVAILABLE");
}
