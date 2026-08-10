import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";
import { errorText, logger } from "@/core/observability/logger";

export type BusinessNotificationKind =
  | "NEW_BOOKING"
  | "RECEIPT_PROCESSING"
  | "RECEIPT_NEEDS_REVIEW"
  | "PAYMENT_APPROVED"
  | "PAYMENT_REJECTED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_RESCHEDULED"
  | "UPCOMING_VISIT"
  | "INTEGRATION_ERROR"
  | "SUBSCRIPTION_ENDING"
  | "SUBSCRIPTION_GRACE"
  | "SUBSCRIPTION_EXPIRED";

export type ScheduleBusinessNotificationInput = {
  businessId: string;
  bookingId?: string;
  kind: BusinessNotificationKind;
  deduplicationKey: string;
  scheduledAt: Date;
};

type NotificationDatabase = Pick<Prisma.TransactionClient, "businessNotification" | "business">;

const NOTIFICATION_GATE_FIELD: Partial<Record<BusinessNotificationKind, "notifyOnNewBooking" | "notifyOnPaymentNeedsReview" | "notifyOnCancellation">> = {
  BOOKING_CONFIRMED: "notifyOnNewBooking",
  RECEIPT_NEEDS_REVIEW: "notifyOnPaymentNeedsReview",
  BOOKING_CANCELLED: "notifyOnCancellation",
};

export async function scheduleBusinessNotification(
  input: ScheduleBusinessNotificationInput,
  database: NotificationDatabase = prisma,
) {
  const gateField = NOTIFICATION_GATE_FIELD[input.kind];
  if (gateField) {
    const business = await database.business.findUnique({
      where: { id: input.businessId },
      select: { [gateField]: true },
    });
    if (business && !business[gateField]) return null;
  }
  return database.businessNotification.upsert({
    where: {
      businessId_deduplicationKey: {
        businessId: input.businessId,
        deduplicationKey: input.deduplicationKey,
      },
    },
    create: {
      businessId: input.businessId,
      bookingId: input.bookingId,
      kind: input.kind,
      deduplicationKey: input.deduplicationKey,
      scheduledAt: input.scheduledAt,
    },
    update: {
      bookingId: input.bookingId,
      kind: input.kind,
      scheduledAt: input.scheduledAt,
    },
  });
}

export async function scheduleBusinessNotificationSafely(
  input: ScheduleBusinessNotificationInput,
  database: NotificationDatabase = prisma,
) {
  try {
    return await scheduleBusinessNotification(input, database);
  } catch (error) {
    // Swallowed on purpose — a booking must not fail because its notification could not be queued.
    // Logged so that "the owner got no Telegram card for this booking" is diagnosable afterwards.
    logger.warn("business_notification.schedule_failed", {
      businessId: input.businessId,
      bookingId: input.bookingId,
      kind: input.kind,
      error: errorText(error),
    });
    return null;
  }
}

export async function scheduleUpcomingBusinessVisit(
  input: { businessId: string; bookingId: string; startsAt: Date },
  database: NotificationDatabase = prisma,
) {
  await database.businessNotification.updateMany({
    where: {
      businessId: input.businessId,
      bookingId: input.bookingId,
      kind: "UPCOMING_VISIT",
      status: { in: ["SCHEDULED", "PROCESSING"] },
    },
    data: { status: "SKIPPED" },
  });
  const scheduledAt = new Date(input.startsAt.getTime() - 60 * 60_000);
  return scheduleBusinessNotification({
    businessId: input.businessId,
    bookingId: input.bookingId,
    kind: "UPCOMING_VISIT",
    deduplicationKey: `booking:${input.bookingId}:upcoming:${input.startsAt.toISOString()}`,
    scheduledAt,
  }, database);
}

export function skipUpcomingBusinessVisit(
  input: { businessId: string; bookingId: string },
  database: NotificationDatabase = prisma,
) {
  return database.businessNotification.updateMany({
    where: {
      businessId: input.businessId,
      bookingId: input.bookingId,
      kind: "UPCOMING_VISIT",
      status: { in: ["SCHEDULED", "PROCESSING"] },
    },
    data: { status: "SKIPPED" },
  });
}
