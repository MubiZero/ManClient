import { prisma } from "@/core/database/prisma";
import { createBusinessBotAction } from "@/core/integrations/business-bot-actions";
import { listBusinessTelegramDestinations } from "@/core/integrations/platform-chat-link";
import type { BusinessNotificationKind } from "@/core/notifications/business-notification-service";
import { errorText, logger } from "@/core/observability/logger";
import { reportError } from "@/core/observability/report-error";
import { createTelegramApi, type TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";

type DeliveryDependencies = {
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) => Promise<void>;
};

const reviewKinds = new Set<BusinessNotificationKind>([
  "RECEIPT_PROCESSING",
  "RECEIPT_NEEDS_REVIEW",
  "PAYMENT_APPROVED",
  "PAYMENT_REJECTED",
]);

export async function sendDueBusinessTelegramNotifications(
  now = new Date(),
  dependencies: DeliveryDependencies = defaultDependencies(),
) {
  const notifications = await prisma.businessNotification.findMany({
    where: { status: { in: ["SCHEDULED", "PROCESSING"] }, scheduledAt: { lte: now } },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });
  let processed = 0;

  for (const candidate of notifications) {
    const notification = await prisma.businessNotification.findUniqueOrThrow({
      where: { id: candidate.id },
      include: {
        business: { select: { id: true, name: true } },
        booking: {
          include: {
            customer: true,
            service: true,
            branch: true,
            staff: true,
            payment: true,
          },
        },
      },
    });
    const destinations = await listBusinessTelegramDestinations(notification.businessId);
    const eligible = destinations.filter(destination => isEligible(
      notification.kind as BusinessNotificationKind,
      notification.booking?.staff.id,
      destination,
    ));
    await prisma.$transaction(eligible.map(destination => prisma.businessNotificationDelivery.upsert({
      where: { notificationId_destinationId: { notificationId: notification.id, destinationId: destination.destinationId } },
      create: { notificationId: notification.id, destinationId: destination.destinationId, scheduledAt: notification.scheduledAt },
      update: {},
    })));
    if (eligible.length === 0) {
      await prisma.businessNotification.update({ where: { id: notification.id }, data: { status: "SKIPPED" } });
      processed += 1;
      continue;
    }

    const deliveries = await prisma.businessNotificationDelivery.findMany({
      where: { notificationId: notification.id, status: "SCHEDULED", scheduledAt: { lte: now } },
      include: {
        destination: {
          include: {
            telegramIdentity: { include: { membership: true } },
          },
        },
      },
    });
    for (const delivery of deliveries) {
      const claimed = await prisma.businessNotificationDelivery.updateMany({
        where: { id: delivery.id, status: "SCHEDULED", scheduledAt: { lte: now } },
        data: { status: "PROCESSING" },
      });
      if (claimed.count !== 1) continue;
      try {
        const view = await notificationView(notification, delivery.destination, now);
        await dependencies.sendMessage(delivery.destination.chatId, view.text, view.replyMarkup);
        await prisma.businessNotificationDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENT", attempts: { increment: 1 }, lastError: null },
        });
      } catch (error) {
        const attempts = delivery.attempts + 1;
        const exhausted = attempts >= delivery.maxAttempts;
        await prisma.businessNotificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: exhausted ? "FAILED" : "SCHEDULED",
            attempts,
            scheduledAt: exhausted ? delivery.scheduledAt : new Date(now.getTime() + 5 * 60_000),
            // Stays generic on purpose: the bot token travels in the Telegram request URL, so a raw
            // client error is not something to persist. The detail goes to the log instead.
            lastError: "Telegram delivery failed",
          },
        });
        const context = { notificationId: notification.id, deliveryId: delivery.id, businessId: notification.businessId, kind: notification.kind, attempts };
        if (exhausted) {
          reportError({ event: "business_notification.delivery_failed", error, context, fingerprint: `business-notification:${notification.kind}` });
        } else {
          logger.warn("business_notification.delivery_retrying", { ...context, error: errorText(error) });
        }
      }
    }
    await refreshNotificationStatus(notification.id);
    processed += 1;
  }
  return processed;
}

export function isEligible(
  kind: BusinessNotificationKind,
  bookingStaffId: string | undefined,
  destination: { role: "OWNER" | "ADMIN" | "STAFF"; staffId: string | null },
) {
  if (destination.role !== "STAFF") return true;
  if (reviewKinds.has(kind)) return false;
  return Boolean(bookingStaffId && destination.staffId === bookingStaffId);
}

async function notificationView(
  notification: {
    kind: string;
    businessId: string;
    business: { id: string; name: string };
    booking: {
      id: string;
      startsAt: Date;
      status: string;
      customer: { name: string };
      service: { name: string };
      branch: { timeZone: string; name: string };
      staff: { displayName: string };
      payment: { id: string; status: string } | null;
    } | null;
  },
  destination: {
    chatId: string;
    telegramIdentity: { telegramUserId: string; membership: { userId: string } };
  },
  now: Date,
) {
  const booking = notification.booking;
  const title = notificationTitle(notification.kind as BusinessNotificationKind);
  if (!booking) return { text: title };
  const visit = new Intl.DateTimeFormat("ru-RU", {
    timeZone: booking.branch.timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(booking.startsAt);
  const actionKind = reviewKinds.has(notification.kind as BusinessNotificationKind) && booking.payment
    ? "payment.open"
    : "booking.open";
  const payload = actionKind === "payment.open" ? { paymentId: booking.payment!.id } : { bookingId: booking.id };
  const action = await createBusinessBotAction({
    businessId: notification.businessId,
    userId: destination.telegramIdentity.membership.userId,
    telegramUserId: destination.telegramIdentity.telegramUserId,
    destination: { chatId: destination.chatId },
  }, {
    kind: actionKind,
    payload,
    expiresAt: new Date(now.getTime() + 15 * 60_000),
  });
  return {
    text: `${title}\n\n${visit}\n${booking.customer.name} · ${booking.service.name}\n${booking.staff.displayName} · ${booking.branch.name}`,
    replyMarkup: { inline_keyboard: [[{ text: actionKind === "payment.open" ? "Проверить чек" : "Открыть запись", callback_data: action.actionId }]] },
  };
}

function notificationTitle(kind: BusinessNotificationKind) {
  return ({
    NEW_BOOKING: "Новая запись",
    RECEIPT_PROCESSING: "Клиент отправил чек",
    RECEIPT_NEEDS_REVIEW: "Чек требует проверки",
    PAYMENT_APPROVED: "Оплата подтверждена",
    PAYMENT_REJECTED: "Чек отклонён",
    BOOKING_CONFIRMED: "Запись подтверждена",
    BOOKING_CANCELLED: "Запись отменена",
    BOOKING_RESCHEDULED: "Запись перенесена",
    UPCOMING_VISIT: "Скоро визит клиента",
    INTEGRATION_ERROR: "Ошибка Telegram-интеграции",
  } satisfies Record<BusinessNotificationKind, string>)[kind];
}

async function refreshNotificationStatus(notificationId: string) {
  const deliveries = await prisma.businessNotificationDelivery.groupBy({
    by: ["status"],
    where: { notificationId },
    _count: { _all: true },
  });
  const statuses = new Set(deliveries.map(item => item.status));
  const status = statuses.has("SCHEDULED") || statuses.has("PROCESSING")
    ? "PROCESSING"
    : statuses.has("FAILED")
      ? "FAILED"
      : "SENT";
  await prisma.businessNotification.update({ where: { id: notificationId }, data: { status } });
}

function defaultDependencies(): DeliveryDependencies {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  const telegram = createTelegramApi(token);
  return { sendMessage: telegram.sendMessage };
}
