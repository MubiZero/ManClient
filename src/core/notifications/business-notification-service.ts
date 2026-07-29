import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

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
  | "INTEGRATION_ERROR";

export type ScheduleBusinessNotificationInput = {
  businessId: string;
  bookingId?: string;
  kind: BusinessNotificationKind;
  deduplicationKey: string;
  scheduledAt: Date;
};

type NotificationDatabase = Pick<Prisma.TransactionClient, "businessNotification">;

export function scheduleBusinessNotification(
  input: ScheduleBusinessNotificationInput,
  database: NotificationDatabase = prisma,
) {
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
  } catch {
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
