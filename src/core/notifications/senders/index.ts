import type { MessageChannel } from "@/generated/prisma/client";

import type { Sender } from "@/core/notifications/delivery";
import { sendOnSms } from "@/core/notifications/senders/sms-sender";
import { sendOnTelegram } from "@/core/notifications/senders/telegram-sender";
import { sendOnWhatsApp } from "@/core/notifications/senders/whatsapp-sender";

/**
 * One entry per channel, so the delivery job asks the table which function to call instead of
 * carrying a three-branch `if` that every new channel makes longer. Typed against the enum: adding a
 * channel to the schema stops compiling here until it has a sender, which is exactly where the
 * omission should be caught rather than at two in the morning on a customer's reminder.
 */
export const SENDERS: Record<MessageChannel, Sender> = {
  TELEGRAM: sendOnTelegram,
  WHATSAPP: sendOnWhatsApp,
  SMS: sendOnSms,
};
