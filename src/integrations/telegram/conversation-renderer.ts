import type { TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";

export type TelegramConversationButton = {
  text: string;
  callbackData?: string;
  url?: string;
};

export function inlineButtons(buttons: TelegramConversationButton[]): TelegramReplyMarkup {
  return {
    inline_keyboard: buttons.map((button) => [{
      text: button.text,
      ...(button.callbackData ? { callback_data: button.callbackData } : {}),
      ...(button.url ? { url: button.url } : {}),
    }]),
  };
}

export function contactKeyboard(locale: "ru" | "tg"): TelegramReplyMarkup {
  return {
    keyboard: [[{
      text: locale === "tg" ? "Рақами телефонро фиристед" : "Отправить номер телефона",
      request_contact: true,
    }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}
