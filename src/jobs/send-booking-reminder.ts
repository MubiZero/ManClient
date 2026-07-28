import { prisma } from "@/core/database/prisma";
import { sendTelegramMessage } from "@/integrations/telegram/telegram-client";
import { sendTemplateMessage, type WhatsAppTemplateMessage } from "@/integrations/whatsapp/whatsapp-client";

type DeliveryDependencies = {
  sendTelegram: (chatId: string, text: string) => Promise<void>;
  sendWhatsApp: (input: WhatsAppTemplateMessage) => Promise<{ externalId: string }>;
};

const defaultDependencies: DeliveryDependencies = {
  sendTelegram: sendTelegramMessage,
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
      include: { booking: { include: { customer: true, business: true, service: true } } },
    });
    if (message.booking.startsAt <= now || message.booking.status !== "CONFIRMED") {
      await prisma.message.update({ where: { id: message.id }, data: { status: "SKIPPED" } });
      processed += 1;
      continue;
    }

    try {
      let externalId: string | undefined;
      if (message.channel === "TELEGRAM") {
        const chatId = message.booking.customer.telegramChatId;
        if (!chatId) throw new Error("Telegram chat is unavailable");
        await dependencies.sendTelegram(chatId, reminderText(message.booking));
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

function reminderText(booking: { customer: { name: string }; service: { name: string }; startsAt: Date }) {
  return `${booking.customer.name}, напоминаем о записи на ${booking.service.name}: ${formatVisitTime(booking.startsAt)}.`;
}

function formatVisitTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dushanbe", dateStyle: "medium", timeStyle: "short" }).format(value);
}
