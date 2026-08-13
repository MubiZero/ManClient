import { createCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { WAITLIST_MESSAGE_KIND } from "@/core/bookings/waitlist-service";
import { formatVisitTime, type DeliveryTarget, type Sender } from "@/core/notifications/delivery";
import { decryptSecret } from "@/core/security/secret-encryption";

/**
 * The free channel, and the only one whose wording we own: Telegram takes plain text, so the message
 * is written here rather than approved months ago by somebody else's moderator.
 */
export const sendOnTelegram: Sender = async ({ kind, target, now }, dependencies) => {
  const chatId = target.customer.telegramChatId;
  if (!chatId) return { delivered: false, unavailable: "customer has no Telegram chat" };

  const encryptedToken = target.business.telegramIntegrations[0]?.botTokenEncrypted;
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  // A salon that disconnected its bot, or a platform without the key to read the token: neither is
  // fixed by trying again in five minutes, so the message goes down the ladder instead.
  if (!encryptedToken || !encryptionKey) return { delivered: false, unavailable: "business Telegram bot is unavailable" };

  const reviewUrl = kind === "REVIEW_REQUEST" && target.bookingId ? buildReviewUrl(target.bookingId, now) : undefined;
  await dependencies.sendTelegram(decryptSecret(encryptedToken, encryptionKey), chatId, telegramText(kind, target, reviewUrl));
  return { delivered: true };
};

function buildReviewUrl(bookingId: string, now: Date): string {
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  const token = createCustomerBookingToken({ bookingId, action: "review_booking", expiresAt });
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  return `${appUrl}/review/${token}`;
}

export function telegramText(kind: string, target: DeliveryTarget, reviewUrl?: string): string {
  const booking = { customer: target.customer, service: { name: target.serviceName }, startsAt: target.occursAt };
  const tg = target.customer.telegramLocale === "tg";
  if (kind === WAITLIST_MESSAGE_KIND) {
    return tg
      ? `Вақти озод пайдо шуд: ${formatVisitTime(target.occursAt, target.timeZone, "tg-TJ")}. Лутфан ҳарчи зудтар бо мо тамос гиред.`
      : `Освободилось время из вашего листа ожидания: ${formatVisitTime(target.occursAt, target.timeZone)}. Свяжитесь с нами, чтобы записаться.`;
  }
  if (kind === "REVIEW_REQUEST") {
    return tg
      ? `Ташаккур барои ташриф! Лутфан моро баҳо диҳед: ${reviewUrl}`
      : `Спасибо за визит! Оцените нас: ${reviewUrl}`;
  }
  if (kind === "BOOKING_CONFIRMATION") {
    return tg
      ? `Сабти шумо тасдиқ шуд: ${booking.service.name}, ${formatVisitTime(booking.startsAt, target.timeZone, "tg-TJ")}.`
      : `Запись подтверждена: ${booking.service.name}, ${formatVisitTime(booking.startsAt, target.timeZone)}.`;
  }
  if (kind === "PAYMENT_APPROVED") return tg ? "Пардохт тасдиқ шуд. Сабти шумо тасдиқ шудааст." : "Оплата подтверждена. Запись сохранена.";
  if (kind === "PAYMENT_REJECTED") return tg ? "Расид тасдиқ нашуд. Лутфан расиди дурустро аз нав фиристед." : "Чек не подтверждён. Откройте запись и отправьте корректный чек ещё раз.";
  if (kind === "RECEIPT_NEEDS_REVIEW") return tg ? "Расид қабул шуд ва ба маъмур барои санҷиш фиристода шуд." : "Чек получен и передан администратору на проверку.";
  if (kind === "BOOKING_CANCELLED") return tg ? "Сабт бекор шуд." : "Запись отменена.";
  if (kind === "BOOKING_RESCHEDULED") return tg ? `Вақти нави сабт: ${formatVisitTime(booking.startsAt, target.timeZone, "tg-TJ")}.` : `Запись перенесена: ${formatVisitTime(booking.startsAt, target.timeZone, "ru-RU")}.`;
  if (kind === "PAYMENT_REMINDER") {
    return tg ? `${booking.customer.name}, пардохти сабтро барои ${booking.service.name} ёдрас мекунем: ${formatVisitTime(booking.startsAt, target.timeZone, "tg-TJ")}.` : `${booking.customer.name}, напоминаем об оплате записи на ${booking.service.name}: ${formatVisitTime(booking.startsAt, target.timeZone)}.`;
  }
  return tg ? `${booking.customer.name}, сабти шуморо барои ${booking.service.name} ёдрас мекунем: ${formatVisitTime(booking.startsAt, target.timeZone, "tg-TJ")}.` : `${booking.customer.name}, напоминаем о записи на ${booking.service.name}: ${formatVisitTime(booking.startsAt, target.timeZone)}.`;
}
