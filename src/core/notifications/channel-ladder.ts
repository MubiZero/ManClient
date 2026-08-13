import type { MessageChannel } from "@/generated/prisma/client";

import { businessHasFeature } from "@/core/platform/subscription-plans";
import type { SubscriptionState } from "@/core/platform/subscription-lifecycle";
import { findPayomTemplateKind } from "@/integrations/payom/payom-templates";

/**
 * One message, one channel — the cheapest one that can actually carry it.
 *
 * Until now every eligible channel got its own row: a confirmed booking produced a Telegram message
 * *and* a WhatsApp message *and* an SMS. The customer read the first and was interrupted twice more,
 * and we paid 0,045 сомони for the SMS we did not need. The cost is not theoretical — it is the
 * single largest variable cost the platform has, and it was being spent on customers who had already
 * been reached for free.
 *
 * So the channels are a ladder rather than a set. Delivery starts at the top and only walks down
 * when a rung cannot carry the message: no Telegram chat, no approved WhatsApp template, a bot token
 * that has been revoked. SMS is last because it is the only one that costs money and the only one
 * that reaches everybody — the two facts that make it a fallback rather than a default.
 *
 * Push sits above Telegram the day the mobile app exists; adding it is one entry in this array and
 * one sender, which is the point of expressing the order as data.
 */
export const CHANNEL_LADDER = ["TELEGRAM", "WHATSAPP", "SMS"] as const satisfies readonly MessageChannel[];

/**
 * The WhatsApp template each kind is allowed to use. Absent means the kind does not go over WhatsApp
 * at all: templates are approved wordings, and borrowing the reminder template to say "leave us a
 * review" would send the customer a sentence about an appointment that is not happening.
 */
const WHATSAPP_TEMPLATES: Record<string, "reminder" | "confirmation" | "cancellation"> = {
  BOOKING_REMINDER: "reminder",
  BOOKING_CONFIRMATION: "confirmation",
  // The same news as a confirmation, and the same approved wording: the customer is being told their
  // booking stands, not being sent an accounting note.
  PAYMENT_APPROVED: "confirmation",
  BOOKING_CANCELLED: "cancellation",
  PAYMENT_REJECTED: "reminder",
};

export type ChannelBusiness = SubscriptionState & {
  smsNotificationsEnabled: boolean;
  whatsappPhoneNumberId: string | null;
  whatsappTemplateName: string | null;
  whatsappConfirmationTemplateName: string | null;
  whatsappCancellationTemplateName: string | null;
};

export type ChannelCandidate = {
  kind: string;
  customer: { telegramChatId: string | null };
  business: ChannelBusiness;
};

export function whatsappTemplateFor(kind: string, business: ChannelBusiness): string | null {
  const template = WHATSAPP_TEMPLATES[kind];
  if (!template) return null;
  if (template === "confirmation") return business.whatsappConfirmationTemplateName;
  if (template === "cancellation") return business.whatsappCancellationTemplateName;
  return business.whatsappTemplateName;
}

/**
 * Whether this channel could carry this message today. Answered from stored settings only — whether
 * the provider then accepts it is delivery's problem, and a channel that fails there hands the
 * message down the ladder rather than burying it.
 */
export function canDeliverOn(channel: MessageChannel, candidate: ChannelCandidate): boolean {
  if (channel === "TELEGRAM") return Boolean(candidate.customer.telegramChatId);
  if (channel === "WHATSAPP") {
    return Boolean(candidate.business.whatsappPhoneNumberId) && Boolean(whatsappTemplateFor(candidate.kind, candidate.business));
  }
  // Two switches guard SMS: the salon's own toggle and the plan it pays for. Both existed before the
  // ladder and both still decide entirely on their own whether a message may cost money.
  return (
    candidate.business.smsNotificationsEnabled &&
    businessHasFeature(candidate.business, "SMS") &&
    findPayomTemplateKind(candidate.kind) !== null
  );
}

/** The channel this message should be tried on first, or null when nothing can carry it. */
export function firstChannelFor(candidate: ChannelCandidate): MessageChannel | null {
  return CHANNEL_LADDER.find((channel) => canDeliverOn(channel, candidate)) ?? null;
}

/** The next rung down after `channel` failed, or null when the ladder is exhausted. */
export function nextChannelAfter(channel: MessageChannel, candidate: ChannelCandidate): MessageChannel | null {
  const position = CHANNEL_LADDER.indexOf(channel as (typeof CHANNEL_LADDER)[number]);
  if (position < 0) return null;
  return CHANNEL_LADDER.slice(position + 1).find((next) => canDeliverOn(next, candidate)) ?? null;
}
