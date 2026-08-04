import type { Business, BusinessTelegramIntegration, Customer, Prisma } from "@/generated/prisma/client";

import { createCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { WAITLIST_MESSAGE_KIND } from "@/core/bookings/waitlist-service";
import { prisma } from "@/core/database/prisma";
import { decryptSecret } from "@/core/security/secret-encryption";
import { sendSms, type PayomSmsMessage } from "@/integrations/payom/payom-client";
import { buildPayomVariables, findPayomTemplateKind } from "@/integrations/payom/payom-templates";
import { createTelegramApi } from "@/integrations/telegram/telegram-api";
import { sendTemplateMessage, type WhatsAppTemplateMessage } from "@/integrations/whatsapp/whatsapp-client";

type DeliverableMessage = Prisma.MessageGetPayload<{
  include: {
    booking: { include: { customer: true; payment: true; business: { include: { telegramIntegrations: true } }; service: true } };
    waitlistEntry: { include: { customer: true; business: { include: { telegramIntegrations: true } }; service: true } };
  };
}>;

/** A message flattened away from its source, so delivery does not care where it came from. */
type DeliveryTarget = {
  bookingId: string | null;
  customer: Customer;
  business: Business & { telegramIntegrations: BusinessTelegramIntegration[] };
  serviceName: string;
  /** The moment the message is about: the visit, or the slot that came free. */
  occursAt: Date;
};

type DeliveryDependencies = {
  sendTelegram: (token: string, chatId: string, text: string) => Promise<void>;
  sendWhatsApp: (input: WhatsAppTemplateMessage) => Promise<{ externalId: string }>;
  sendSms: (input: PayomSmsMessage) => Promise<{ externalId: string; deliveryStatus: string }>;
};

const defaultDependencies: DeliveryDependencies = {
  sendTelegram: (token, chatId, text) => createTelegramApi(token).sendMessage(chatId, text),
  sendWhatsApp: sendTemplateMessage,
  sendSms,
};

/**
 * `scope` narrows the sweep to a single business — see expire-pending-bookings.ts for why it exists.
 */
export async function sendDueBookingReminders(now = new Date(), dependencies = defaultDependencies, scope?: { businessId: string }) {
  const due = await prisma.message.findMany({
    where: { ...(scope ? { businessId: scope.businessId } : {}), status: "SCHEDULED", scheduledAt: { lte: now } },
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
        waitlistEntry: {
          include: {
            customer: true,
            business: { include: { telegramIntegrations: { where: { status: "ACTIVE" }, take: 1 } } },
            service: true,
          },
        },
      },
    });
    const target = resolveTarget(message, now);
    if (!target) {
      await prisma.message.update({ where: { id: message.id }, data: { status: "SKIPPED" } });
      processed += 1;
      continue;
    }

    try {
      let externalId: string | undefined;
      if (message.channel === "TELEGRAM") {
        const chatId = target.customer.telegramChatId;
        if (!chatId) throw new Error("Telegram chat is unavailable");
        const encryptedToken = target.business.telegramIntegrations[0]?.botTokenEncrypted;
        const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
        if (!encryptedToken || !encryptionKey) throw new Error("Business Telegram bot is unavailable");
        const reviewUrl = message.kind === "REVIEW_REQUEST" && target.bookingId ? buildReviewUrl(target.bookingId, now) : undefined;
        await dependencies.sendTelegram(decryptSecret(encryptedToken, encryptionKey), chatId, reminderText(message.kind, target, reviewUrl));
      } else if (message.channel === "SMS") {
        const templateKind = findPayomTemplateKind(message.kind);
        // No approved template means this kind cannot go out over SMS at all, so retrying it three
        // times and burying it in FAILED would be noise. Skip it the same way an ineligible
        // booking is skipped above.
        if (!templateKind) {
          await prisma.message.update({ where: { id: message.id }, data: { status: "SKIPPED" } });
          processed += 1;
          continue;
        }
        const template = buildPayomVariables(templateKind, target.customer.telegramLocale, {
          businessName: target.business.name,
          startsAt: target.occursAt,
        });
        externalId = (await dependencies.sendSms({ telephone: target.customer.phone, ...template })).externalId;
      } else {
        const business = target.business;
        if (!business.whatsappPhoneNumberId) throw new Error("WhatsApp business settings are unavailable");
        const templateName = message.kind === "BOOKING_CONFIRMATION"
          ? business.whatsappConfirmationTemplateName
          : message.kind === "BOOKING_CANCELLED"
            ? business.whatsappCancellationTemplateName
            : business.whatsappTemplateName;
        if (!templateName) throw new Error("WhatsApp template is unavailable");
        externalId = (await dependencies.sendWhatsApp({
          phoneNumberId: business.whatsappPhoneNumberId,
          to: target.customer.phone,
          templateName,
          languageCode: business.whatsappLanguageCode,
          parameters: [target.customer.name, formatVisitTime(target.occursAt), target.serviceName],
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

/**
 * Most messages hang off a booking, but a freed-slot alert hangs off a waitlist entry and has no
 * booking at all. Both are flattened to the same shape here so the delivery branches below stay
 * channel-shaped rather than growing a second copy per source.
 *
 * Returns null when the message should no longer go out — the booking was cancelled under it, the
 * visit has already happened, the waitlist entry was taken or withdrawn. The caller marks those
 * SKIPPED rather than retrying them.
 */
function resolveTarget(message: DeliverableMessage, now: Date): DeliveryTarget | null {
  if (message.waitlistEntry) {
    const entry = message.waitlistEntry;
    // An entry that moved on (CONVERTED because they booked, CANCELLED because they withdrew) must
    // not be told the slot is free, and neither must anyone if the slot itself is now in the past.
    if (entry.status !== "NOTIFIED" || !entry.freedStartsAt || entry.freedStartsAt <= now) return null;
    return {
      bookingId: null,
      customer: entry.customer,
      business: entry.business,
      serviceName: entry.service.name,
      occursAt: entry.freedStartsAt,
    };
  }

  const booking = message.booking;
  if (!booking) return null;
  const eligible = message.kind === "PAYMENT_REMINDER"
    ? booking.status === "PENDING_PAYMENT" && booking.payment?.status === "PENDING"
    : message.kind === "BOOKING_CANCELLED"
      ? booking.status === "CANCELLED"
      : message.kind === "PAYMENT_REJECTED" || message.kind === "RECEIPT_NEEDS_REVIEW"
        ? booking.status === "PENDING_PAYMENT"
        : booking.status === "CONFIRMED";
  const visitMustBeFuture = ["BOOKING_REMINDER", "PAYMENT_REMINDER"].includes(message.kind);
  if (!eligible || (visitMustBeFuture && booking.startsAt <= now)) return null;

  return {
    bookingId: booking.id,
    customer: booking.customer,
    business: booking.business,
    serviceName: booking.service.name,
    occursAt: booking.startsAt,
  };
}

function buildReviewUrl(bookingId: string, now: Date): string {
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  const token = createCustomerBookingToken({ bookingId, action: "review_booking", expiresAt });
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  return `${appUrl}/review/${token}`;
}

function reminderText(kind: string, target: DeliveryTarget, reviewUrl?: string) {
  const booking = { customer: target.customer, service: { name: target.serviceName }, startsAt: target.occursAt };
  const tg = target.customer.telegramLocale === "tg";
  if (kind === WAITLIST_MESSAGE_KIND) {
    return tg
      ? `Вақти озод пайдо шуд: ${formatVisitTime(target.occursAt, "tg-TJ")}. Лутфан ҳарчи зудтар бо мо тамос гиред.`
      : `Освободилось время из вашего листа ожидания: ${formatVisitTime(target.occursAt)}. Свяжитесь с нами, чтобы записаться.`;
  }
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
