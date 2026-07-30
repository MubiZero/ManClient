import type { TelegramInlineKeyboard, TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";

export type TelegramConversationButton = {
  text: string;
  callbackData?: string;
  url?: string;
};

export function inlineButtons(buttons: TelegramConversationButton[]): TelegramInlineKeyboard {
  return {
    inline_keyboard: buttons.map(button => [renderInlineButton(button)]),
  };
}

export function inlineButtonGrid(
  buttons: TelegramConversationButton[],
  columns: number,
  trailingRows: TelegramConversationButton[][] = [],
): TelegramInlineKeyboard {
  if (!Number.isInteger(columns) || columns < 1) throw new Error("Inline keyboard columns must be positive");
  const rows: TelegramConversationButton[][] = [];
  for (let index = 0; index < buttons.length; index += columns) rows.push(buttons.slice(index, index + columns));
  return { inline_keyboard: [...rows, ...trailingRows].map(row => row.map(renderInlineButton)) };
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

function renderInlineButton(button: TelegramConversationButton) {
  return {
    text: button.text,
    ...(button.callbackData ? { callback_data: button.callbackData } : {}),
    ...(button.url ? { url: button.url } : {}),
  };
}
