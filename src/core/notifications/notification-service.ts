import type { Prisma } from "@/generated/prisma/client";

import { businessHasFeature } from "@/core/platform/subscription-plans";
import type { SubscriptionState } from "@/core/platform/subscription-lifecycle";
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
    ...(booking.business.smsNotificationsEnabled && businessHasFeature(booking.business, "SMS") ? ["SMS" as const] : []),
  ];
  return Promise.all(channels.map((channel) => database.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel, kind: "BOOKING_REMINDER" } },
    create: { businessId: booking.businessId, bookingId, channel, kind: "BOOKING_REMINDER", scheduledAt },
    update: { scheduledAt, status: "SCHEDULED", attempts: 0, lastError: null },
  })));
}

export async function scheduleReviewRequest(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, business: true },
  });
  if (!booking || booking.status !== "CONFIRMED") return null;
  if (!businessHasFeature(booking.business, "REVIEWS")) return null;

  // WhatsApp only supports pre-approved templates and there is no dedicated review-request
  // template field on Business, so review requests are Telegram-only for now (see report).
  const channel = booking.customer.telegramChatId ? ("TELEGRAM" as const) : null;
  if (!channel) return null;

  const scheduledAt = new Date(booking.endsAt.getTime() + 2 * 60 * 60_000);
  return database.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel, kind: "REVIEW_REQUEST" } },
    create: { businessId: booking.businessId, bookingId, channel, kind: "REVIEW_REQUEST", scheduledAt },
    update: { scheduledAt, status: "SCHEDULED", attempts: 0, lastError: null },
  });
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

export async function scheduleWhatsAppCancellation(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({
    where: { id: bookingId },
    include: { business: true },
  });
  if (!booking || booking.status !== "CANCELLED" || !booking.business.whatsappPhoneNumberId || !booking.business.whatsappCancellationTemplateName) return null;
  return database.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel: "WHATSAPP", kind: "BOOKING_CANCELLED" } },
    create: { businessId: booking.businessId, bookingId, channel: "WHATSAPP", kind: "BOOKING_CANCELLED", scheduledAt: new Date() },
    update: {},
  });
}

export async function scheduleWhatsAppPaymentRejected(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({
    where: { id: bookingId },
    include: { business: true },
  });
  if (!booking || booking.status !== "PENDING_PAYMENT" || !booking.business.whatsappPhoneNumberId || !booking.business.whatsappTemplateName) return null;
  return database.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel: "WHATSAPP", kind: "PAYMENT_REJECTED" } },
    create: { businessId: booking.businessId, bookingId, channel: "WHATSAPP", kind: "PAYMENT_REJECTED", scheduledAt: new Date() },
    update: {},
  });
}

function businessHasSms(business: SubscriptionState & { smsNotificationsEnabled: boolean }): boolean {
  return business.smsNotificationsEnabled && businessHasFeature(business, "SMS");
}

export async function scheduleSmsConfirmation(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({
    where: { id: bookingId },
    include: { business: true },
  });
  if (!booking || booking.status !== "CONFIRMED" || !businessHasSms(booking.business)) return null;
  return database.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel: "SMS", kind: "BOOKING_CONFIRMATION" } },
    create: { businessId: booking.businessId, bookingId, channel: "SMS", kind: "BOOKING_CONFIRMATION", scheduledAt: new Date() },
    update: {},
  });
}

export async function scheduleSmsCancellation(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({
    where: { id: bookingId },
    include: { business: true },
  });
  if (!booking || booking.status !== "CANCELLED" || !businessHasSms(booking.business)) return null;
  return database.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel: "SMS", kind: "BOOKING_CANCELLED" } },
    create: { businessId: booking.businessId, bookingId, channel: "SMS", kind: "BOOKING_CANCELLED", scheduledAt: new Date() },
    update: {},
  });
}

export async function scheduleSmsPaymentRejected(bookingId: string, database: NotificationDatabase = prisma) {
  const booking = await database.booking.findUnique({
    where: { id: bookingId },
    include: { business: true },
  });
  if (!booking || booking.status !== "PENDING_PAYMENT" || !businessHasSms(booking.business)) return null;
  return database.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel: "SMS", kind: "PAYMENT_REJECTED" } },
    create: { businessId: booking.businessId, bookingId, channel: "SMS", kind: "PAYMENT_REJECTED", scheduledAt: new Date() },
    update: {},
  });
}
