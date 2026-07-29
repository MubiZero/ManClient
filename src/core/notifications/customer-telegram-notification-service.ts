import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

export type CustomerTelegramNotificationKind =
  | "RECEIPT_NEEDS_REVIEW"
  | "PAYMENT_APPROVED"
  | "PAYMENT_REJECTED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED";

type Database = Pick<Prisma.TransactionClient, "booking" | "message">;

export async function scheduleCustomerTelegramNotification(
  input: { bookingId: string; kind: CustomerTelegramNotificationKind; scheduledAt?: Date },
  database: Database = prisma,
) {
  const booking = await database.booking.findUnique({ where: { id: input.bookingId }, include: { customer: true } });
  if (!booking?.customer.telegramChatId) return null;
  const scheduledAt = input.scheduledAt ?? new Date();
  return database.message.upsert({
    where: { bookingId_channel_kind: { bookingId: booking.id, channel: "TELEGRAM", kind: input.kind } },
    create: { businessId: booking.businessId, bookingId: booking.id, channel: "TELEGRAM", kind: input.kind, scheduledAt },
    update: { status: "SCHEDULED", scheduledAt, attempts: 0, lastError: null },
  });
}
