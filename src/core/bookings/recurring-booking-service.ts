import { z } from "zod";

import { assertAvailable } from "@/core/booking-operations/booking-command-service";
import { requireBookingAccess } from "@/core/booking-operations/booking-access";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { BookingConflictError, reserveAllocation } from "@/core/bookings/booking-allocation";
import { cancelBooking, type BookingActor } from "@/core/bookings/cancel-booking";
import { scheduleConfirmationEffects } from "@/core/bookings/confirm-booking-effects";
import { SettingsError } from "@/core/business-settings/settings-error";
import type { Booking, RecurrenceFrequency } from "@/generated/prisma/client";
import { prisma } from "@/core/database/prisma";
import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";
import {
  scheduleBusinessNotification,
  scheduleBusinessNotificationSafely,
  scheduleUpcomingBusinessVisit,
} from "@/core/notifications/business-notification-service";
import { scheduleBookingReminders } from "@/core/notifications/notification-service";
import { SUBSCRIPTION_SELECT, requirePlanFeature } from "@/core/platform/subscription-plans";

const RESERVATION_MINUTES = 15;
const MIN_OCCURRENCES = 2;
const MAX_OCCURRENCES = 12;

const recurringSchema = z.object({
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  startsAt: z.date(),
  customer: z.object({ name: z.string().trim().min(2).max(120), phone: z.string().min(1) }),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  occurrencesTotal: z.number().int(),
  source: z.enum(["WEB", "DASHBOARD"]),
});

export type CreateRecurringBookingInput = {
  businessId: string;
  actorUserId?: string;
} & z.input<typeof recurringSchema>;

export type { BookingActor };

export async function createRecurringBooking(input: CreateRecurringBookingInput, now = new Date()) {
  let value: z.output<typeof recurringSchema>;
  try {
    value = recurringSchema.parse(input);
  } catch {
    throw new SettingsError("INVALID_INPUT");
  }
  if (value.occurrencesTotal < MIN_OCCURRENCES || value.occurrencesTotal > MAX_OCCURRENCES) {
    throw new SettingsError("INVALID_INPUT");
  }

  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { id: true, ...SUBSCRIPTION_SELECT, prepaymentMode: true, depositPercent: true, depositAmountDiram: true },
  });
  if (!business) throw new SettingsError("NOT_FOUND");
  requirePlanFeature(business, "RECURRING_BOOKINGS");

  const phone = normalizeTajikPhone(value.customer.phone);
  if (!phone) throw new SettingsError("INVALID_INPUT");

  let membershipId: string | null = null;
  if (value.source === "DASHBOARD") {
    if (!input.actorUserId) throw new SettingsError("FORBIDDEN");
    let scope: Awaited<ReturnType<typeof requireBookingAccess>>;
    try {
      scope = await requireBookingAccess({ businessId: input.businessId, actorUserId: input.actorUserId });
    } catch (error) {
      if (error instanceof BookingOperationError) throw new SettingsError("FORBIDDEN");
      throw error;
    }
    if (scope.role === "STAFF" && scope.staffId !== value.staffId) throw new SettingsError("FORBIDDEN");
    membershipId = scope.id;
  }

  const service = await prisma.service.findFirst({
    where: {
      id: value.serviceId,
      branchId: value.branchId,
      branch: { businessId: input.businessId, archivedAt: null },
      archivedAt: null,
      isPublished: true,
      staffMembers: { some: { id: value.staffId, businessId: input.businessId, archivedAt: null, branches: { some: { branchId: value.branchId } } } },
    },
    select: { id: true, durationMinutes: true, amountDiram: true, prepaymentMode: true, depositPercent: true, depositAmountDiram: true, resources: { where: { resource: { archivedAt: null, isAvailable: true } }, select: { resourceId: true } } },
  });
  if (!service) throw new SettingsError("NOT_FOUND");
  const resourceIds = service.resources.map((item) => item.resourceId);

  const customer = await prisma.customer.upsert({
    where: { businessId_phone: { businessId: input.businessId, phone } },
    create: { businessId: input.businessId, name: value.customer.name, phone },
    update: { name: value.customer.name },
  });

  const series = await prisma.bookingSeries.create({
    data: {
      businessId: input.businessId,
      branchId: value.branchId,
      serviceId: value.serviceId,
      staffId: value.staffId,
      customerId: customer.id,
      frequency: value.frequency,
      intervalCount: 1,
      occurrencesTotal: value.occurrencesTotal,
      createdBy: value.source === "DASHBOARD" ? `membership:${membershipId}` : `customer:${customer.id}`,
    },
  });

  const created: Booking[] = [];
  let skipped = 0;
  let occurrenceStartsAt = value.startsAt;
  for (let index = 0; index < value.occurrencesTotal; index += 1) {
    if (index > 0) occurrenceStartsAt = addInterval(occurrenceStartsAt, value.frequency);
    try {
      await assertAvailable({
        branchId: value.branchId,
        serviceId: value.serviceId,
        staffId: value.staffId,
        resourceIds,
        startsAt: occurrenceStartsAt,
        durationMinutes: service.durationMinutes,
        // Only the first visit of a customer's series is held to the booking policy. A twelve-week series
        // deliberately reaches past any sane booking horizon, and refusing week thirteen of a series the
        // business enabled on purpose would make the feature useless.
        actor: value.source === "DASHBOARD" || index > 0 ? "staff" : "customer",
        now,
      });
      const isDashboard = value.source === "DASHBOARD";
      const booking = await reserveAllocation({
        branchId: value.branchId,
        serviceId: value.serviceId,
        staffId: value.staffId,
        customerId: customer.id,
        resourceIds,
        startsAt: occurrenceStartsAt,
        durationMinutes: service.durationMinutes,
        expiresAt: isDashboard ? null : new Date(now.getTime() + RESERVATION_MINUTES * 60_000),
        createdAt: now,
        amountDiram: service.amountDiram,
        // Dashboard series are confirmed by the receptionist creating them; a customer's own series is
        // held to the business's prepayment rule, occurrence by occurrence.
        prepayment: isDashboard ? undefined : { business, service },
        status: isDashboard ? "CONFIRMED" : undefined,
        source: isDashboard ? "DASHBOARD" : "WEB",
        actor: isDashboard ? { type: "membership", id: membershipId! } : { type: "customer", id: customer.id },
        confirmedAt: isDashboard ? now : undefined,
        confirmedBy: isDashboard ? `membership:${membershipId}` : undefined,
      });
      const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: { seriesId: series.id, seriesIndex: index },
      });
      created.push(updated);

      if (isDashboard) {
        await scheduleBookingReminders(booking.id);
        await scheduleBusinessNotification({ businessId: input.businessId, bookingId: booking.id, kind: "BOOKING_CONFIRMED", deduplicationKey: `booking:${booking.id}:confirmed`, scheduledAt: now });
        await scheduleUpcomingBusinessVisit({ businessId: input.businessId, bookingId: booking.id, startsAt: occurrenceStartsAt });
      } else {
        await scheduleBusinessNotificationSafely({ businessId: input.businessId, bookingId: booking.id, kind: "NEW_BOOKING", deduplicationKey: `booking:${booking.id}:created`, scheduledAt: now });
        if (booking.status === "CONFIRMED") {
          await prisma.$transaction((transaction) => scheduleConfirmationEffects({
            businessId: input.businessId,
            bookingId: booking.id,
            startsAt: occurrenceStartsAt,
            notificationKind: "BOOKING_CONFIRMED",
            deduplicationKey: `booking:${booking.id}:confirmed`,
          }, transaction, now));
        }
      }
    } catch (error) {
      if (error instanceof BookingConflictError || (error instanceof Error && error.message === "SLOT_UNAVAILABLE")) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { seriesId: series.id, created, skipped };
}

export async function cancelBookingSeries(
  input: { businessId: string; seriesId: string; actor: BookingActor; reason?: string },
  now = new Date(),
) {
  const series = await prisma.bookingSeries.findFirst({ where: { id: input.seriesId, businessId: input.businessId } });
  if (!series) throw new SettingsError("NOT_FOUND");
  if (series.status === "CANCELLED") return { seriesId: series.id, cancelledCount: 0 };

  await prisma.bookingSeries.update({ where: { id: series.id }, data: { status: "CANCELLED" } });

  const bookings = await prisma.booking.findMany({
    where: { seriesId: series.id, startsAt: { gt: now }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
    select: { id: true },
  });

  let cancelledCount = 0;
  for (const booking of bookings) {
    try {
      await cancelBooking({ bookingId: booking.id, actor: input.actor }, now);
      cancelledCount += 1;
    } catch {
      // Booking may have changed status concurrently; skip and continue with the rest of the series.
    }
  }

  const actorId = input.actor.type === "customer" ? input.actor.customerId : input.actor.membershipId;
  await writeAuditEvent({
    businessId: input.businessId,
    type: "booking_series.cancelled",
    actorType: input.actor.type,
    actorId,
    metadata: { seriesId: series.id, reason: input.reason ?? null, cancelledCount },
  });

  return { seriesId: series.id, cancelledCount };
}

function addInterval(date: Date, frequency: RecurrenceFrequency): Date {
  if (frequency === "WEEKLY") return new Date(date.getTime() + 7 * 24 * 60 * 60_000);
  if (frequency === "BIWEEKLY") return new Date(date.getTime() + 14 * 24 * 60 * 60_000);
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}
