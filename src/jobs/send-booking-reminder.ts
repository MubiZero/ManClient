import { createCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { prisma } from "@/core/database/prisma";
import { decryptSecret } from "@/core/security/secret-encryption";
import { sendSms } from "@/integrations/payom/payom-client";
import { createTelegramApi } from "@/integrations/telegram/telegram-api";
import { sendTemplateMessage, type WhatsAppTemplateMessage } from "@/integrations/whatsapp/whatsapp-client";

type DeliveryDependencies = {
  sendTelegram: (token: string, chatId: string, text: string) => Promise<void>;
  sendWhatsApp: (input: WhatsAppTemplateMessage) => Promise<{ externalId: string }>;
  sendSms: (input: { telephone: string; text: string }) => Promise<{ externalId: string; deliveryStatus: string }>;
};

const defaultDependencies: DeliveryDependencies = {
  sendTelegram: (token, chatId, text) => createTelegramApi(token).sendMessage(chatId, text),
  sendWhatsApp: sendTemplateMessage,
  sendSms,
};

export async function sendDueBookingReminders(now = new Date(), dependencies = defaultDependencies) {
  const due = await prisma.message.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });
  let processed = 0;

  for (const candidate of due) {
    const claimed = await prisma.message.updateMany({
      where: { id: candidate.id, status: "SCHEDULED" },
      data: { status: "PROCESSING" },
    });
    if (claimed.count !== 1) continue;

    const message = await prisma.message.findUniqueOrThrow({
      where: { id: candidate.id },
      include: {
        booking: {
          include: {
            customer: true,
            payment: true,
            business: { include: { telegramIntegrations: { where: { status: "ACTIVE" }, take: 1 } } },
            service: true,
          },
        },
      },
    });
    const eligible = message.kind === "PAYMENT_REMINDER"
      ? message.booking.status === "PENDING_PAYMENT" && message.booking.payment?.status === "PENDING"
      : message.kind === "BOOKING_CANCELLED"
        ? message.booking.status === "CANCELLED"
        : message.kind === "PAYMENT_REJECTED" || message.kind === "RECEIPT_NEEDS_REVIEW"
          ? message.booking.status === "PENDING_PAYMENT"
          : message.booking.status === "CONFIRMED";
    const visitMustBeFuture = ["BOOKING_REMINDER", "PAYMENT_REMINDER"].includes(message.kind);
    if ((visitMustBeFuture && message.booking.startsAt <= now) || !eligible) {
      await prisma.message.update({ where: { id: message.id }, data: { status: "SKIPPED" } });
      processed += 1;
      continue;
    }

    try {
      let externalId: string | undefined;
      if (message.channel === "TELEGRAM") {
        const chatId = message.booking.customer.telegramChatId;
        if (!chatId) throw new Error("Telegram chat is unavailable");
        const encryptedToken = message.booking.business.telegramIntegrations[0]?.botTokenEncrypted;
        const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
        if (!encryptedToken || !encryptionKey) throw new Error("Business Telegram bot is unavailable");
        const reviewUrl = message.kind === "REVIEW_REQUEST" ? buildReviewUrl(message.bookingId, now) : undefined;
        await dependencies.sendTelegram(decryptSecret(encryptedToken, encryptionKey), chatId, reminderText(message.kind, message.booking, reviewUrl));
      } else if (message.channel === "SMS") {
        externalId = (await dependencies.sendSms({
          telephone: message.booking.customer.phone,
          text: reminderText(message.kind, message.booking),
        })).externalId;
      } else {
        const business = message.booking.business;
        if (!business.whatsappPhoneNumberId) throw new Error("WhatsApp business settings are unavailable");
        const templateName = message.kind === "BOOKING_CONFIRMATION"
          ? business.whatsappConfirmationTemplateName
          : message.kind === "BOOKING_CANCELLED"
            ? business.whatsappCancellationTemplateName
            : business.whatsappTemplateName;
        if (!templateName) throw new Error("WhatsApp template is unavailable");
        externalId = (await dependencies.sendWhatsApp({
          phoneNumberId: business.whatsappPhoneNumberId,
          to: message.booking.customer.phone,
          templateName,
          languageCode: business.whatsappLanguageCode,
          parameters: [message.booking.customer.name, formatVisitTime(message.booking.startsAt), message.booking.service.name],
        })).externalId;
      }
      await prisma.message.update({ where: { id: message.id }, data: { status: "SENT", attempts: { increment: 1 }, externalId } });
    } catch {
      const attempts = message.attempts + 1;
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: attempts >= message.maxAttempts ? "FAILED" : "SCHEDULED",
          attempts,
          scheduledAt: attempts >= message.maxAttempts ? message.scheduledAt : new Date(now.getTime() + 5 * 60_000),
          lastError: `${message.channel} delivery failed`,
        },
      });
    }
    processed += 1;
  }

  return processed;
}

function buildReviewUrl(bookingId: string, now: Date): string {
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  const token = createCustomerBookingToken({ bookingId, action: "review_booking", expiresAt });
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  return `${appUrl}/review/${token}`;
}

function reminderText(kind: string, booking: { customer: { name: string; telegramLocale: string }; service: { name: string }; startsAt: Date }, reviewUrl?: string) {
  const tg = booking.customer.telegramLocale === "tg";
  if (kind === "REVIEW_REQUEST") {
    return tg
      ? `Ташаккур барои ташриф! Лутфан моро баҳо диҳед: ${reviewUrl}`
      : `Спасибо за визит! Оцените нас: ${reviewUrl}`;
  }
  if (kind === "PAYMENT_APPROVED") return tg ? "Пардохт тасдиқ шуд. Сабти шумо тасдиқ шудааст." : "Оплата подтверждена. Запись сохранена.";
  if (kind === "PAYMENT_REJECTED") return tg ? "Расид тасдиқ нашуд. Лутфан расиди дурустро аз нав фиристед." : "Чек не подтверждён. Откройте запись и отправьте корректный чек ещё раз.";
  if (kind === "RECEIPT_NEEDS_REVIEW") return tg ? "Расид қабул шуд ва ба маъмур барои санҷиш фиристода шуд." : "Чек получен и передан администратору на проверку.";
  if (kind === "BOOKING_CANCELLED") return tg ? "Сабт бекор шуд." : "Запись отменена.";
  if (kind === "BOOKING_RESCHEDULED") return tg ? `Вақти нави сабт: ${formatVisitTime(booking.startsAt, "tg-TJ")}.` : `Запись перенесена: ${formatVisitTime(booking.startsAt, "ru-RU")}.`;
  if (kind === "PAYMENT_REMINDER") {
    return tg ? `${booking.customer.name}, пардохти сабтро барои ${booking.service.name} ёдрас мекунем: ${formatVisitTime(booking.startsAt, "tg-TJ")}.` : `${booking.customer.name}, напоминаем об оплате записи на ${booking.service.name}: ${formatVisitTime(booking.startsAt)}.`;
  }
  return tg ? `${booking.customer.name}, сабти шуморо барои ${booking.service.name} ёдрас мекунем: ${formatVisitTime(booking.startsAt, "tg-TJ")}.` : `${booking.customer.name}, напоминаем о записи на ${booking.service.name}: ${formatVisitTime(booking.startsAt)}.`;
}

function formatVisitTime(value: Date, locale = "ru-RU") {
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Dushanbe", dateStyle: "medium", timeStyle: "short" }).format(value);
}
