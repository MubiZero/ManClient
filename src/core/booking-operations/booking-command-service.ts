import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { getAvailableStarts } from "@/core/availability/availability-service";
import { bookingScopeWhere, requireBookingAccess } from "@/core/booking-operations/booking-access";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { reserveAllocation } from "@/core/bookings/booking-allocation";
import { notifyWaitlistForFreedSlot } from "@/core/bookings/waitlist-service";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";
import { localDateTimeToUtc } from "@/core/formatting/dushanbe-date";
import { scheduleBookingReminders, scheduleReviewRequest, scheduleSmsCancellation, scheduleWhatsAppCancellation } from "@/core/notifications/notification-service";
import {
  scheduleBusinessNotification,
  scheduleUpcomingBusinessVisit,
  skipUpcomingBusinessVisit,
} from "@/core/notifications/business-notification-service";

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
    const booking = await reserveAllocation({ branchId: value.branchId, serviceId: value.serviceId, staffId: value.staffId, customerId: customer.id, resourceIds, startsAt: value.startsAt, durationMinutes: service.durationMinutes, expiresAt: null, createdAt: now, amountDiram: service.amountDiram, status: "CONFIRMED", source: "DASHBOARD", actor: { type: "membership", id: scope.id }, confirmedAt: now, confirmedBy: `membership:${scope.id}` });
    await scheduleBookingReminders(booking.id);
    await scheduleReviewRequest(booking.id);
    await scheduleBusinessNotification({ businessId: input.businessId, bookingId: booking.id, kind: "BOOKING_CONFIRMED", deduplicationKey: `booking:${booking.id}:confirmed`, scheduledAt: now });
    await scheduleUpcomingBusinessVisit({ businessId: input.businessId, bookingId: booking.id, startsAt: value.startsAt });
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
    await scheduleBusinessNotification({ businessId: input.businessId, bookingId: booking.id, kind: "BOOKING_CONFIRMED", deduplicationKey: `booking:${booking.id}:confirmed`, scheduledAt: now }, transaction);
    await scheduleUpcomingBusinessVisit({ businessId: input.businessId, bookingId: booking.id, startsAt: booking.startsAt }, transaction);
    return { id: booking.id, changed: true };
  });
  if (result.changed) {
    await scheduleBookingReminders(result.id);
    await scheduleReviewRequest(result.id);
  }
  return { bookingId: result.id };
}

export async function rescheduleBusinessBooking(input: ActorInput & { bookingId: string; startsAt: Date }, now = new Date()) {
  if (input.startsAt <= now) throw new BookingOperationError("INVALID_INPUT");
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
        await scheduleBusinessNotification({ businessId: input.businessId, bookingId: current.id, kind: "BOOKING_RESCHEDULED", deduplicationKey: `booking:${current.id}:rescheduled:${input.startsAt.toISOString()}`, scheduledAt: now }, transaction);
        await scheduleUpcomingBusinessVisit({ businessId: input.businessId, bookingId: current.id, startsAt: input.startsAt }, transaction);
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
    await skipUpcomingBusinessVisit({ businessId: input.businessId, bookingId: booking.id }, transaction);
    await scheduleBusinessNotification({ businessId: input.businessId, bookingId: booking.id, kind: "BOOKING_CANCELLED", deduplicationKey: `booking:${booking.id}:cancelled`, scheduledAt: now }, transaction);
    await scheduleWhatsAppCancellation(booking.id, transaction);
    await scheduleSmsCancellation(booking.id, transaction);
    await writeAuditEvent({ businessId: input.businessId, bookingId: booking.id, type: "booking.cancelled", actorType: "membership", actorId: scope.id, metadata: { cancelledAt: now.toISOString(), reason } }, transaction);
    await notifyWaitlistForFreedSlot(
      { businessId: input.businessId, branchId: booking.branchId, serviceId: booking.serviceId, staffId: booking.staffId, freedStartsAt: booking.startsAt, freedEndsAt: booking.endsAt },
      transaction,
      now,
    );
    return { bookingId: booking.id };
  });
}

export async function remindBusinessBookingPayment(input: ActorInput & { bookingId: string }, now = new Date()) {
  return prisma.$transaction(async (transaction) => {
    const scope = await requireBookingAccess(input, transaction);
    const booking = await transaction.booking.findFirst({
      where: { id: input.bookingId, ...bookingScopeWhere(scope) },
      include: { customer: true, payment: true },
    });
    if (!booking) throw new BookingOperationError("NOT_FOUND");
    if (!booking.customer.telegramChatId) throw new BookingOperationError("CUSTOMER_TELEGRAM_UNAVAILABLE");
    if (booking.status !== "PENDING_PAYMENT" || booking.payment?.status !== "PENDING") {
      throw new BookingOperationError("INVALID_STATUS");
    }
    const created = await transaction.message.createMany({
      data: [{
        businessId: input.businessId,
        bookingId: booking.id,
        channel: "TELEGRAM",
        kind: "PAYMENT_REMINDER",
        scheduledAt: now,
      }],
      skipDuplicates: true,
    });
    if (created.count === 1) {
      await writeAuditEvent({
        businessId: input.businessId,
        bookingId: booking.id,
        type: "booking.payment_reminder_scheduled",
        actorType: "membership",
        actorId: scope.id,
        metadata: { channel: "TELEGRAM" },
      }, transaction);
    }
    return { bookingId: booking.id, scheduled: created.count === 1 };
  });
}

export async function getBusinessBookingAvailableStarts(
  input: ActorInput & { bookingId: string; date: string },
) {
  const scope = await requireBookingAccess(input);
  const booking = await prisma.booking.findFirst({
    where: {
      id: input.bookingId,
      ...bookingScopeWhere(scope),
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
    },
    include: { branch: true, service: true, resources: true },
  });
  if (!booking) throw new BookingOperationError("NOT_FOUND");
  let rangeStartsAt: Date;
  let rangeEndsAt: Date;
  try {
    rangeStartsAt = localDateTimeToUtc(input.date, "00:00", booking.branch.timeZone);
    rangeEndsAt = localDateTimeToUtc(nextDate(input.date), "00:00", booking.branch.timeZone);
  } catch {
    throw new BookingOperationError("INVALID_INPUT");
  }
  const starts = await getAvailableStarts({
    branchId: booking.branchId,
    serviceId: booking.serviceId,
    staffId: booking.staffId,
    resourceIds: booking.resources.map(item => item.resourceId),
    rangeStartsAt,
    rangeEndsAt,
    durationMinutes: booking.service.durationMinutes,
    intervalMinutes: 30,
    excludeBookingId: booking.id,
    // The dashboard is staff acting on their own calendar: the minimum-notice and booking-horizon rules
    // exist to shape what customers may do, not to stop a receptionist moving today's visit by an hour.
    actor: "staff",
  });
  return { starts, timeZone: booking.branch.timeZone };
}

/**
 * `actor` defaults to staff because the dashboard is this function's main caller. A public caller must
 * pass `"customer"` explicitly so the business's minimum-notice and horizon rules apply.
 */
export async function assertAvailable(input: { branchId: string; serviceId: string; staffId: string; resourceIds: string[]; startsAt: Date; durationMinutes: number; excludeBookingId?: string; actor?: "customer" | "staff"; now?: Date }) {
  const starts = await getAvailableStarts({ ...input, rangeStartsAt: input.startsAt, rangeEndsAt: new Date(input.startsAt.getTime() + input.durationMinutes * 60_000), intervalMinutes: input.durationMinutes, actor: input.actor ?? "staff" });
  if (starts.length !== 1) throw new BookingOperationError("SLOT_UNAVAILABLE");
}

function nextDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_DATE");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_DATE");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
