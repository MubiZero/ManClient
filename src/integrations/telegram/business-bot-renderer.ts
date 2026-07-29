import { formatSomoni } from "@/core/formatting/money";
import type { TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";

export type BusinessBotRole = "OWNER" | "ADMIN" | "STAFF";

export type BusinessBotAction = {
  actionId: string;
  text: string;
};

export type BusinessBotView = {
  text: string;
  replyMarkup?: TelegramReplyMarkup;
};

type Confirmation = {
  text: string;
  confirmAction: BusinessBotAction;
  dismissAction: BusinessBotAction;
};

export type BookingListViewModel = {
  title: string;
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

export function mainMenuView(input: { role: BusinessBotRole }): BusinessBotView {
  const menu = [
    [{ text: "Сегодня" }, { text: "Записи" }],
    ...(input.role === "STAFF" ? [] : [[{ text: "Проверить чеки" }, { text: "Настройки" }]]),
  ];
  return { text: "Главное меню", replyMarkup: { keyboard: menu, resize_keyboard: true } };
}

export function bookingListView(input: BookingListViewModel): BusinessBotView {
  if (!input.items.length) {
    return { text: `${input.title}\n\nЗаписей нет.` };
  }

  return {
    text: [input.title, "", ...input.items.map((item) => [
      `${formatDateTime(item.startsAt, item.timeZone)} · ${item.customerName}`,
      `${item.serviceName} · ${paymentStatusLabel(item.paymentStatus)}`,
    ].join("\n"))].join("\n\n"),
    replyMarkup: inlineButtons(input.items.map((item) => [item.openAction])),
  };
}

export function bookingCardView(input: BookingCardViewModel): BusinessBotView {
  const details = [
    `Запись: ${input.customerName}`,
    `${input.serviceName} · ${input.staffName}`,
    `${input.branchName} · ${formatDateTime(input.startsAt, input.timeZone)}`,
    `Телефон: ${input.customerPhone}`,
    `Статус: ${bookingStatusLabel(input.bookingStatus)}`,
    `Оплата: ${paymentStatusLabel(input.paymentStatus)} · ${formatSomoni(input.amountDiram)}`,
  ];
  if (input.confirmation) {
    return confirmationView(details, input.confirmation);
  }
  const actions = input.actions ?? (input.openPaymentAction ? [input.openPaymentAction] : []);
  return {
    text: details.join("\n"),
    ...(actions.length ? { replyMarkup: inlineButtons([actions]) } : {}),
  };
}

export function paymentReviewView(input: PaymentReviewViewModel): BusinessBotView {
  const details = [
    `Проверка оплаты: ${input.customerName}`,
    `${input.serviceName} · ${formatDateTime(input.startsAt, input.timeZone)}`,
    `Сумма: ${formatSomoni(input.amountDiram)}`,
    ...(input.recipientCardLast4 ? [`Карта получателя: •••• ${input.recipientCardLast4.slice(-4)}`] : []),
    ...(input.attentionReason ? [`Причина проверки: ${input.attentionReason}`] : []),
  ];
  if (input.confirmation) {
    return confirmationView(details, input.confirmation);
  }
  return {
    text: details.join("\n"),
    ...(input.openReceiptAction ? { replyMarkup: inlineButtons([[input.openReceiptAction]]) } : {}),
  };
}

export function staleActionView(input: { menuAction: BusinessBotAction }): BusinessBotView {
  return {
    text: "Это действие уже недействительно. Откройте актуальное меню.",
    replyMarkup: inlineButtons([[input.menuAction]]),
  };
}

function confirmationView(details: string[], confirmation: Confirmation): BusinessBotView {
  return {
    text: [...details, "", confirmation.text].join("\n"),
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

function formatDateTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-TJ", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(value);
}

function bookingStatusLabel(status: string): string {
  return ({
    CONFIRMED: "Подтверждена",
    PENDING_PAYMENT: "Ждёт оплаты",
    CANCELLED: "Отменена",
    EXPIRED: "Истекла",
  } as Record<string, string>)[status] ?? "Актуальная";
}

function paymentStatusLabel(status: string): string {
  return ({
    PENDING: "Не оплачено",
    RECEIPT_PROCESSING: "Чек обрабатывается",
    NEEDS_ATTENTION: "Проверить чек",
    RECEIPT_ACCEPTED: "Подтверждена",
    REJECTED: "Отклонена",
  } as Record<string, string>)[status] ?? "Без оплаты";
}
