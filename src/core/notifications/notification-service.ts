import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

type NotificationDatabase = Pick<Prisma.TransactionClient, "booking" | "message">;

export async function scheduleBookingReminders(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, business: true },
  });
  if (!booking || booking.status !== "CONFIRMED") return [];

  const scheduledAt = new Date(booking.startsAt.getTime() - 24 * 60 * 60_000);
  const channels = [
    ...(booking.customer.telegramChatId ? ["TELEGRAM" as const] : []),
    ...(booking.business.whatsappPhoneNumberId && booking.business.whatsappTemplateName ? ["WHATSAPP" as const] : []),
  ];
  return Promise.all(channels.map((channel) => database.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel, kind: "BOOKING_REMINDER" } },
    create: { businessId: booking.businessId, bookingId, channel, kind: "BOOKING_REMINDER", scheduledAt },
    update: { scheduledAt, status: "SCHEDULED", attempts: 0, lastError: null },
  })));
}

export async function scheduleWhatsAppConfirmation(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({
    where: { id: bookingId },
    include: { business: true },
  });
  if (!booking || booking.status !== "CONFIRMED" || !booking.business.whatsappPhoneNumberId || !booking.business.whatsappConfirmationTemplateName) return null;
  return database.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel: "WHATSAPP", kind: "BOOKING_CONFIRMATION" } },
    create: { businessId: booking.businessId, bookingId, channel: "WHATSAPP", kind: "BOOKING_CONFIRMATION", scheduledAt: new Date() },
    update: {},
  });
}
