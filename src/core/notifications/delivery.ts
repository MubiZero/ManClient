import type { Business, BusinessTelegramIntegration, Customer } from "@/generated/prisma/client";

import { sendSms, type PayomSmsMessage } from "@/integrations/payom/payom-client";
import { createTelegramApi } from "@/integrations/telegram/telegram-api";
import { sendTemplateMessage, type WhatsAppTemplateMessage } from "@/integrations/whatsapp/whatsapp-client";

/** A message flattened away from its source, so delivery does not care where it came from. */
export type DeliveryTarget = {
  bookingId: string | null;
  customer: Customer;
  business: Business & { telegramIntegrations: BusinessTelegramIntegration[] };
  serviceName: string;
  /** The moment the message is about: the visit, or the slot that came free. */
  occursAt: Date;
  /** The branch's timezone — the only one in which "18:00" means anything to the customer. */
  timeZone: string;
};

export type DeliveryDependencies = {
  sendTelegram: (token: string, chatId: string, text: string) => Promise<void>;
  sendWhatsApp: (input: WhatsAppTemplateMessage) => Promise<{ externalId: string }>;
  sendSms: (input: PayomSmsMessage) => Promise<{ externalId: string; deliveryStatus: string }>;
};

export const defaultDependencies: DeliveryDependencies = {
  sendTelegram: (token, chatId, text) => createTelegramApi(token).sendMessage(chatId, text),
  sendWhatsApp: sendTemplateMessage,
  sendSms,
};

/**
 * What a channel did with the message.
 *
 * The distinction that matters is between `unavailable` and a thrown error. Unavailable means this
 * channel cannot carry this message at all — no chat, no token, no approved template — and retrying
 * it four minutes later will fail identically, so the caller walks down the ladder instead. A thrown
 * error means the channel could have worked and did not: a timeout, a 500, a rate limit. Those are
 * retried, because the next attempt genuinely might land.
 */
export type SendOutcome = { delivered: true; externalId?: string } | { delivered: false; unavailable: string };

export type Sender = (
  input: { kind: string; target: DeliveryTarget; now: Date },
  dependencies: DeliveryDependencies,
) => Promise<SendOutcome>;

export function formatVisitTime(value: Date, timeZone: string, locale = "ru-RU"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(value);
}
