import { describe, expect, it } from "vitest";

import {
  bookingCardView,
  bookingListView,
  mainMenuView,
  paymentReviewView,
  staleActionView,
  type BookingCardViewModel,
} from "@/integrations/telegram/business-bot-renderer";

type RenderedButton = { text: string };

function buttons(view: { replyMarkup?: { inline_keyboard?: Array<Array<RenderedButton>>; keyboard?: Array<Array<RenderedButton>> } }): Array<Array<RenderedButton>> {
  return view.replyMarkup?.inline_keyboard ?? view.replyMarkup?.keyboard ?? [];
}

function expectNoMoreThanTwoButtonsPerRow(view: { replyMarkup?: { inline_keyboard?: Array<Array<RenderedButton>>; keyboard?: Array<Array<RenderedButton>> } }) {
  expect(buttons(view).every((row) => row.length <= 2)).toBe(true);
}

describe("business bot renderer", () => {
  it("shows a role-aware native main menu", () => {
    const owner = mainMenuView({ role: "OWNER" });
    const staff = mainMenuView({ role: "STAFF" });

    expect(buttons(owner).flat().map((button) => button.text)).toEqual([
      "Сегодня", "Записи", "Проверить чеки", "Настройки",
    ]);
    expect(buttons(staff).flat().map((button) => button.text)).toEqual(["Сегодня", "Записи"]);
    expectNoMoreThanTwoButtonsPerRow(owner);
    expectNoMoreThanTwoButtonsPerRow(staff);
  });

  it("renders booking list rows with useful local visit and payment context", () => {
    const view = bookingListView({
      title: "Записи на сегодня",
      items: [{
        customerName: "Мухаммад",
        serviceName: "Стрижка",
        startsAt: new Date("2026-07-29T09:30:00.000Z"),
        timeZone: "Asia/Dushanbe",
        paymentStatus: "NEEDS_ATTENTION",
        openAction: { actionId: "act_open_7Yp", text: "Открыть" },
      }],
    });

    expect(view.text).toContain("Мухаммад");
    expect(view.text).toContain("Стрижка");
    expect(view.text).toContain("14:30");
    expect(view.text).toContain("Проверить чек");
    expect(buttons(view)).toEqual([[{ text: "Открыть", callback_data: "act_open_7Yp" }]]);
    expectNoMoreThanTwoButtonsPerRow(view);
  });

  it("renders a safe booking card without internal ids or full card data", () => {
    const view = bookingCardView({
      customerName: "Мухаммад",
      customerPhone: "+992900001122",
      serviceName: "Стрижка",
      staffName: "Алишер",
      branchName: "Центр",
      startsAt: new Date("2026-07-29T09:30:00.000Z"),
      timeZone: "Asia/Dushanbe",
      bookingStatus: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      amountDiram: 5000,
      openPaymentAction: { actionId: "act_payment_7Yp", text: "Оплата" },
      bookingId: "booking-internal-123",
      recipientCardNumber: "4111111111111111",
    } as unknown as BookingCardViewModel);

    expect(view.text).toContain("Мухаммад");
    expect(view.text).toContain("14:30");
    expect(view.text).toContain("Ждёт оплаты");
    expect(JSON.stringify(view)).not.toContain("booking-internal-123");
    expect(JSON.stringify(view)).not.toContain("4111111111111111");
    expectNoMoreThanTwoButtonsPerRow(view);
  });

  it("uses explicit confirmation copy before a destructive booking action", () => {
    const view = bookingCardView({
      customerName: "Мухаммад",
      customerPhone: "+992900001122",
      serviceName: "Стрижка",
      staffName: "Алишер",
      branchName: "Центр",
      startsAt: new Date("2026-07-29T09:30:00.000Z"),
      timeZone: "Asia/Dushanbe",
      bookingStatus: "CONFIRMED",
      paymentStatus: "RECEIPT_ACCEPTED",
      amountDiram: 5000,
      confirmation: {
        text: "Отменить запись? Клиент получит уведомление.",
        confirmAction: { actionId: "act_cancel_yes_7Yp", text: "Да, отменить" },
        dismissAction: { actionId: "act_cancel_no_7Yp", text: "Назад" },
      },
    });

    expect(view.text).toContain("Отменить запись? Клиент получит уведомление.");
    expect(buttons(view)).toContainEqual([
      { text: "Да, отменить", callback_data: "act_cancel_yes_7Yp" },
      { text: "Назад", callback_data: "act_cancel_no_7Yp" },
    ]);
    expectNoMoreThanTwoButtonsPerRow(view);
  });

  it("keeps every booking card action in rows of at most two buttons", () => {
    const view = bookingCardView({
      customerName: "Мухаммад",
      customerPhone: "+992900001122",
      serviceName: "Стрижка",
      staffName: "Алишер",
      branchName: "Центр",
      startsAt: new Date("2026-07-29T09:30:00.000Z"),
      timeZone: "Asia/Dushanbe",
      bookingStatus: "CONFIRMED",
      paymentStatus: "RECEIPT_ACCEPTED",
      amountDiram: 5000,
      actions: [
        { actionId: "act_first_7Yp", text: "Первое" },
        { actionId: "act_second_7Yp", text: "Второе" },
        { actionId: "act_third_7Yp", text: "Третье" },
      ],
    });

    expect(buttons(view)).toEqual([
      [{ text: "Первое", callback_data: "act_first_7Yp" }, { text: "Второе", callback_data: "act_second_7Yp" }],
      [{ text: "Третье", callback_data: "act_third_7Yp" }],
    ]);
    expectNoMoreThanTwoButtonsPerRow(view);
  });

  it("renders payment review with only a masked card tail and confirmation", () => {
    const view = paymentReviewView({
      customerName: "Мухаммад",
      serviceName: "Стрижка",
      startsAt: new Date("2026-07-29T09:30:00.000Z"),
      timeZone: "Asia/Dushanbe",
      amountDiram: 5000,
      recipientCardLast4: "4111111111111953",
      attentionReason: "Сумма не совпадает",
      confirmation: {
        text: "Подтвердить оплату после сверки чека?",
        confirmAction: { actionId: "act_approve_yes_7Yp", text: "Подтвердить оплату" },
        dismissAction: { actionId: "act_approve_no_7Yp", text: "Назад" },
      },
    });

    expect(view.text).toContain("•••• 1953");
    expect(view.text).toContain("Подтвердить оплату после сверки чека?");
    expect(JSON.stringify(view)).not.toContain("4111111111111111");
    expect(JSON.stringify(view)).not.toContain("4111111111111953");
    expectNoMoreThanTwoButtonsPerRow(view);
  });

  it("renders a stale action as a safe way back to the current menu", () => {
    const view = staleActionView({ menuAction: { actionId: "act_menu_7Yp", text: "Главное меню" } });

    expect(view.text).toContain("уже недействительно");
    expect(buttons(view)).toEqual([[{ text: "Главное меню", callback_data: "act_menu_7Yp" }]]);
    expectNoMoreThanTwoButtonsPerRow(view);
  });
});
