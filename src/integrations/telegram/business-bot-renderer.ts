import { cardLast4 } from "@/core/formatting/card-number";
import { formatSomoni } from "@/core/formatting/money";
import { botMessage, type BotLocale } from "@/integrations/telegram/bot-messages";
import { escapeTelegramHtml, type TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";

export type BusinessBotRole = "OWNER" | "ADMIN" | "STAFF";

export type BusinessBotAction = {
  actionId: string;
  text: string;
};

export type BusinessBotView = {
  text: string;
  replyMarkup?: TelegramReplyMarkup;
  parseMode?: "HTML";
};

type Confirmation = {
  text: string;
  confirmAction: BusinessBotAction;
  dismissAction: BusinessBotAction;
};

export type BookingListViewModel = {
  title: string;
  locale?: BotLocale;
  items: Array<{
    customerName: string;
    serviceName: string;
    startsAt: Date;
    timeZone: string;
    paymentStatus: string;
    openAction: BusinessBotAction;
  }>;
};

export type BookingCardViewModel = {
  locale?: BotLocale;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  startsAt: Date;
  timeZone: string;
  bookingStatus: string;
  paymentStatus: string;
  amountDiram: number;
  actions?: BusinessBotAction[];
  openPaymentAction?: BusinessBotAction;
  confirmation?: Confirmation;
};

export type PaymentReviewViewModel = {
  locale?: BotLocale;
  customerName: string;
  serviceName: string;
  startsAt: Date;
  timeZone: string;
  amountDiram: number;
  recipientCardLast4?: string;
  attentionReason?: string;
  openReceiptAction?: BusinessBotAction;
  confirmation?: Confirmation;
};

export function mainMenuView(input: { role: BusinessBotRole; locale?: BotLocale }): BusinessBotView {
  const locale = input.locale ?? "ru";
  // Staff never review receipts, but they do read the bot in Tajik: the language button stays on every
  // keyboard, because /language alone is invisible to someone who cannot read the Russian menu.
  const menu = [
    [{ text: botMessage(locale, "buttonToday") }, { text: botMessage(locale, "buttonBookings") }],
    input.role === "STAFF"
      ? [{ text: botMessage(locale, "keyboardLanguage") }]
      : [{ text: botMessage(locale, "keyboardCheckReceipts") }, { text: botMessage(locale, "keyboardLanguage") }],
  ];
  return { text: locale === "tg" ? "Менюи асосӣ" : "Главное меню", replyMarkup: { keyboard: menu, resize_keyboard: true } };
}

export function bookingListView(input: BookingListViewModel): BusinessBotView {
  const locale = input.locale ?? "ru";
  if (!input.items.length) {
    return { text: `${input.title}\n\n${locale === "tg" ? "Сабтҳо нестанд." : "Записей нет."}` };
  }

  return {
    text: [input.title, "", ...input.items.map((item) => [
      `${formatDateTime(item.startsAt, item.timeZone, locale)} · ${item.customerName}`,
      `${item.serviceName} · ${paymentStatusLabel(item.paymentStatus, locale)}`,
    ].join("\n"))].join("\n\n"),
    replyMarkup: inlineButtons(input.items.map((item) => [item.openAction])),
  };
}

export function bookingCardView(input: BookingCardViewModel): BusinessBotView {
  const locale = input.locale ?? "ru";
  const details = locale === "tg" ? [
    `Сабт: <b>${escapeTelegramHtml(input.customerName)}</b>`,
    `${escapeTelegramHtml(input.serviceName)} · ${escapeTelegramHtml(input.staffName)}`,
    `${escapeTelegramHtml(input.branchName)} · ${formatDateTime(input.startsAt, input.timeZone, locale)}`,
    `Телефон: ${escapeTelegramHtml(input.customerPhone)}`,
    `Ҳолат: <b>${bookingStatusLabel(input.bookingStatus, locale)}</b>`,
    `Пардохт: ${paymentStatusLabel(input.paymentStatus, locale)} · <b>${formatSomoni(input.amountDiram, "tg-TJ")}</b>`,
  ] : [
    `Запись: <b>${escapeTelegramHtml(input.customerName)}</b>`,
    `${escapeTelegramHtml(input.serviceName)} · ${escapeTelegramHtml(input.staffName)}`,
    `${escapeTelegramHtml(input.branchName)} · ${formatDateTime(input.startsAt, input.timeZone, locale)}`,
    `Телефон: ${escapeTelegramHtml(input.customerPhone)}`,
    `Статус: <b>${bookingStatusLabel(input.bookingStatus, locale)}</b>`,
    `Оплата: ${paymentStatusLabel(input.paymentStatus, locale)} · <b>${formatSomoni(input.amountDiram, "ru-TJ")}</b>`,
  ];
  if (input.confirmation) {
    return confirmationView(details, input.confirmation);
  }
  const actions = input.actions ?? (input.openPaymentAction ? [input.openPaymentAction] : []);
  return {
    text: details.join("\n"),
    parseMode: "HTML",
    ...(actions.length ? { replyMarkup: inlineButtons([actions]) } : {}),
  };
}

export function paymentReviewView(input: PaymentReviewViewModel): BusinessBotView {
  const locale = input.locale ?? "ru";
  const amount = formatSomoni(input.amountDiram, locale === "tg" ? "tg-TJ" : "ru-TJ");
  const details = locale === "tg" ? [
    `Санҷиши пардохт: <b>${escapeTelegramHtml(input.customerName)}</b>`,
    `${escapeTelegramHtml(input.serviceName)} · ${formatDateTime(input.startsAt, input.timeZone, locale)}`,
    `Маблағ: <b>${amount}</b>`,
    ...(input.recipientCardLast4 ? [`Корти гиранда: <b>•••• ${cardLast4(input.recipientCardLast4)}</b>`] : []),
    ...(input.attentionReason ? [`Сабаби санҷиш: ${escapeTelegramHtml(input.attentionReason)}`] : []),
  ] : [
    `Проверка оплаты: <b>${escapeTelegramHtml(input.customerName)}</b>`,
    `${escapeTelegramHtml(input.serviceName)} · ${formatDateTime(input.startsAt, input.timeZone, locale)}`,
    `Сумма: <b>${amount}</b>`,
    ...(input.recipientCardLast4 ? [`Карта получателя: <b>•••• ${cardLast4(input.recipientCardLast4)}</b>`] : []),
    ...(input.attentionReason ? [`Причина проверки: ${escapeTelegramHtml(input.attentionReason)}`] : []),
  ];
  if (input.confirmation) {
    return confirmationView(details, input.confirmation);
  }
  return {
    text: details.join("\n"),
    parseMode: "HTML",
    ...(input.openReceiptAction ? { replyMarkup: inlineButtons([[input.openReceiptAction]]) } : {}),
  };
}

export function accessDeniedText(subject: string, locale: BotLocale = "ru"): string {
  return locale === "tg" ? `Шумо ба ${subject} дастрасӣ надоред.` : `У вас нет доступа к ${subject}.`;
}

export function notFoundText(subject: string, feminine: boolean, locale: BotLocale = "ru"): string {
  if (locale === "tg") return `${subject} ёфт нашуд ё шумо ба он дастрасӣ надоред.`;
  return `${subject} не найден${feminine ? "а" : ""} или у вас нет доступа к ${feminine ? "ней" : "нему"}.`;
}

export function staleActionView(input: { menuAction: BusinessBotAction; locale?: BotLocale }): BusinessBotView {
  const locale = input.locale ?? "ru";
  return {
    text: botMessage(locale, "staleActionSimpleText"),
    replyMarkup: inlineButtons([[input.menuAction]]),
  };
}

function confirmationView(details: string[], confirmation: Confirmation): BusinessBotView {
  return {
    text: [...details, "", confirmation.text].join("\n"),
    parseMode: "HTML",
    replyMarkup: inlineButtons([[confirmation.confirmAction, confirmation.dismissAction]]),
  };
}

function inlineButtons(rows: BusinessBotAction[][]): TelegramReplyMarkup {
  return {
    inline_keyboard: rows.flatMap((row) => Array.from(
      { length: Math.ceil(row.length / 2) },
      (_, index) => row.slice(index * 2, index * 2 + 2).map((action) => ({ text: action.text, callback_data: action.actionId })),
    )),
  };
}

function formatDateTime(value: Date, timeZone: string, locale: BotLocale = "ru"): string {
  return new Intl.DateTimeFormat(locale === "tg" ? "tg-TJ" : "ru-TJ", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(value);
}

export function bookingStatusLabel(status: string, locale: BotLocale = "ru"): string {
  if (locale === "tg") {
    return ({
      CONFIRMED: "Тасдиқшуда",
      PENDING_PAYMENT: "Мунтазири пардохт",
      CANCELLED: "Бекоршуда",
      EXPIRED: "Мӯҳлаташ гузашта",
    } as Record<string, string>)[status] ?? "Актуалӣ";
  }
  return ({
    CONFIRMED: "Подтверждена",
    PENDING_PAYMENT: "Ждёт оплаты",
    CANCELLED: "Отменена",
    EXPIRED: "Истекла",
  } as Record<string, string>)[status] ?? "Актуальная";
}

export function paymentStatusLabel(status: string, locale: BotLocale = "ru"): string {
  if (locale === "tg") {
    return ({
      PENDING: "Пардохт нашуда",
      RECEIPT_PROCESSING: "Чек коркард мешавад",
      NEEDS_ATTENTION: "Санҷиши чек лозим",
      RECEIPT_ACCEPTED: "Тасдиқшуда",
      REJECTED: "Радшуда",
    } as Record<string, string>)[status] ?? "Бе пардохт";
  }
  return ({
    PENDING: "Не оплачено",
    RECEIPT_PROCESSING: "Чек обрабатывается",
    NEEDS_ATTENTION: "Проверить чек",
    RECEIPT_ACCEPTED: "Подтверждена",
    REJECTED: "Отклонена",
  } as Record<string, string>)[status] ?? "Без оплаты";
}
