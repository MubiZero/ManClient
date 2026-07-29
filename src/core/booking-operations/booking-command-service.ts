import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { getAvailableStarts } from "@/core/availability/availability-service";
import { bookingScopeWhere, requireBookingAccess } from "@/core/booking-operations/booking-access";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { reserveAllocation } from "@/core/bookings/booking-allocation";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";
import { scheduleBookingReminders } from "@/core/notifications/notification-service";

type ActorInput = { businessId: string; actorUserId: string };
const manualSchema = z.object({ branchId: z.string().min(1), serviceId: z.string().min(1), staffId: z.string().min(1), startsAt: z.date(), customer: z.object({ name: z.string().trim().min(2).max(120), phone: z.string().min(1) }) });

export async function createManualBooking(input: ActorInput & z.input<typeof manualSchema>, now = new Date()) {
  const value = manualSchema.parse(input);
  const scope = await requireBookingAccess(input);
  if (scope.role === "STAFF" && scope.staffId !== value.staffId) throw new BookingOperationError("FORBIDDEN");
  const phone = normalizeTajikPhone(value.customer.phone);
  if (!phone) throw new BookingOperationError("INVALID_INPUT");
  const service = await prisma.service.findFirst({
    where: { id: value.serviceId, branchId: value.branchId, branch: { businessId: input.businessId, archivedAt: null }, archivedAt: null, isPublished: true, staffMembers: { some: { id: value.staffId, businessId: input.businessId, archivedAt: null, branches: { some: { branchId: value.branchId } } } } },
    select: { id: true, durationMinutes: true, amountDiram: true, resources: { where: { resource: { archivedAt: null, isAvailable: true } }, select: { resourceId: true } } },
  });
  if (!service) throw new BookingOperationError("NOT_FOUND");
  const resourceIds = service.resources.map((item) => item.resourceId);
  await assertAvailable({ branchId: value.branchId, serviceId: value.serviceId, staffId: value.staffId, resourceIds, startsAt: value.startsAt, durationMinutes: service.durationMinutes });
  const customer = await prisma.customer.upsert({ where: { businessId_phone: { businessId: input.businessId, phone } }, create: { businessId: input.businessId, name: value.customer.name, phone }, update: { name: value.customer.name } });
  try {
    const booking = await reserveAllocation({ branchId: value.branchId, serviceId: value.serviceId, staffId: value.staffId, customerId: customer.id, resourceIds, startsAt: value.startsAt, durationMinutes: service.durationMinutes, expiresAt: null, amountDiram: service.amountDiram, status: "CONFIRMED", source: "DASHBOARD", actor: { type: "membership", id: scope.id }, confirmedAt: now, confirmedBy: `membership:${scope.id}` });
    await scheduleBookingReminders(booking.id);
    return { bookingId: booking.id };
  } catch (error) {
    if (error instanceof Error && (error.message === "STAFF_UNAVAILABLE" || error.message === "RESOURCE_UNAVAILABLE")) throw new BookingOperationError("SLOT_UNAVAILABLE");
    throw error;
  }
}

export async function confirmBusinessBooking(input: ActorInput & { bookingId: string }, now = new Date()) {
  const result = await prisma.$transaction(async (transaction) => {
    const scope = await requireBookingAccess(input, transaction);
    const booking = await transaction.booking.findFirst({ where: { id: input.bookingId, ...bookingScopeWhere(scope) }, include: { payment: true } });
    if (!booking) throw new BookingOperationError("NOT_FOUND");
    if (booking.status === "CONFIRMED") return { id: booking.id, changed: false };
    if (booking.status !== "PENDING_PAYMENT") throw new BookingOperationError("INVALID_STATUS");
    await transaction.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED", expiresAt: null, confirmedAt: now, confirmedBy: `membership:${scope.id}` } });
    await writeAuditEvent({ businessId: input.businessId, bookingId: booking.id, type: "booking.confirmed_manually", actorType: "membership", actorId: scope.id, metadata: { paymentStatus: booking.payment?.status ?? "NONE" } }, transaction);
    return { id: booking.id, changed: true };
  });
  if (result.changed) await scheduleBookingReminders(result.id);
  return { bookingId: result.id };
}

export async function rescheduleBusinessBooking(input: ActorInput & { bookingId: string; startsAt: Date }) {
  const scope = await requireBookingAccess(input);
  const booking = await prisma.booking.findFirst({ where: { id: input.bookingId, ...bookingScopeWhere(scope), status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } }, include: { service: true, resources: true } });
  if (!booking) throw new BookingOperationError("NOT_FOUND");
  await assertAvailable({ branchId: booking.branchId, serviceId: booking.serviceId, staffId: booking.staffId, resourceIds: booking.resources.map((item) => item.resourceId), startsAt: input.startsAt, durationMinutes: booking.service.durationMinutes, excludeBookingId: booking.id });
  const endsAt = new Date(input.startsAt.getTime() + booking.service.durationMinutes * 60_000);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(async (transaction) => {
        const currentScope = await requireBookingAccess(input, transaction);
        const current = await transaction.booking.findFirst({ where: { id: input.bookingId, ...bookingScopeWhere(currentScope), status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } }, include: { resources: true } });
        if (!current) throw new BookingOperationError("NOT_FOUND");
        const resourceIds = current.resources.map((item) => item.resourceId);
        const conflict = await transaction.booking.findFirst({ where: { id: { not: current.id }, branchId: current.branchId, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] }, startsAt: { lt: endsAt }, endsAt: { gt: input.startsAt }, OR: [{ staffId: current.staffId }, ...(resourceIds.length ? [{ resources: { some: { resourceId: { in: resourceIds } } } }] : [])] } });
        if (conflict) throw new BookingOperationError("SLOT_UNAVAILABLE");
        await transaction.booking.update({ where: { id: current.id }, data: { startsAt: input.startsAt, endsAt } });
        await writeAuditEvent({ businessId: input.businessId, bookingId: current.id, type: "booking.rescheduled", actorType: "membership", actorId: currentScope.id, metadata: { previousStartsAt: current.startsAt.toISOString(), startsAt: input.startsAt.toISOString() } }, transaction);
      }, { isolationLevel: "Serializable" });
      await scheduleBookingReminders(input.bookingId);
      return { bookingId: input.bookingId };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new BookingOperationError("SLOT_UNAVAILABLE");
}

export async function cancelBusinessBooking(input: ActorInput & { bookingId: string; reason: string }, now = new Date()) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300) throw new BookingOperationError("INVALID_INPUT");
  return prisma.$transaction(async (transaction) => {
    const scope = await requireBookingAccess(input, transaction);
    const booking = await transaction.booking.findFirst({ where: { id: input.bookingId, ...bookingScopeWhere(scope) } });
    if (!booking) throw new BookingOperationError("NOT_FOUND");
    if (booking.status === "CANCELLED") return { bookingId: booking.id };
    if (!(["PENDING_PAYMENT", "CONFIRMED"] as string[]).includes(booking.status)) throw new BookingOperationError("INVALID_STATUS");
    await transaction.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledBy: `membership:${scope.id}`, cancellationReason: reason } });
    await transaction.message.updateMany({ where: { bookingId: booking.id, status: "SCHEDULED" }, data: { status: "SKIPPED", lastError: "BOOKING_CANCELLED" } });
    await writeAuditEvent({ businessId: input.businessId, bookingId: booking.id, type: "booking.cancelled", actorType: "membership", actorId: scope.id, metadata: { cancelledAt: now.toISOString(), reason } }, transaction);
    return { bookingId: booking.id };
  });
}

async function assertAvailable(input: { branchId: string; serviceId: string; staffId: string; resourceIds: string[]; startsAt: Date; durationMinutes: number; excludeBookingId?: string }) {
  const starts = await getAvailableStarts({ ...input, rangeStartsAt: input.startsAt, rangeEndsAt: new Date(input.startsAt.getTime() + input.durationMinutes * 60_000), intervalMinutes: input.durationMinutes });
  if (starts.length !== 1) throw new BookingOperationError("SLOT_UNAVAILABLE");
}
