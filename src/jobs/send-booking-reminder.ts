import { prisma } from "@/core/database/prisma";
import { decryptSecret } from "@/core/security/secret-encryption";
import { createTelegramApi } from "@/integrations/telegram/telegram-api";
import { sendTemplateMessage, type WhatsAppTemplateMessage } from "@/integrations/whatsapp/whatsapp-client";

type DeliveryDependencies = {
  sendTelegram: (token: string, chatId: string, text: string) => Promise<void>;
  sendWhatsApp: (input: WhatsAppTemplateMessage) => Promise<{ externalId: string }>;
};

const defaultDependencies: DeliveryDependencies = {
  sendTelegram: (token, chatId, text) => createTelegramApi(token).sendMessage(chatId, text),
  sendWhatsApp: sendTemplateMessage,
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
      : message.booking.status === "CONFIRMED";
    if (message.booking.startsAt <= now || !eligible) {
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
        await dependencies.sendTelegram(decryptSecret(encryptedToken, encryptionKey), chatId, reminderText(message.kind, message.booking));
      } else {
        const business = message.booking.business;
        if (!business.whatsappPhoneNumberId) throw new Error("WhatsApp business settings are unavailable");
        const templateName = message.kind === "BOOKING_CONFIRMATION"
          ? business.whatsappConfirmationTemplateName
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

function reminderText(kind: string, booking: { customer: { name: string }; service: { name: string }; startsAt: Date }) {
  if (kind === "PAYMENT_REMINDER") {
    return `${booking.customer.name}, напоминаем об оплате записи на ${booking.service.name}: ${formatVisitTime(booking.startsAt)}.`;
  }
  return `${booking.customer.name}, напоминаем о записи на ${booking.service.name}: ${formatVisitTime(booking.startsAt)}.`;
}

function formatVisitTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dushanbe", dateStyle: "medium", timeStyle: "short" }).format(value);
}
