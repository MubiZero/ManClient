// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GraceBanner } from "@/features/dashboard/subscription/grace-banner";
import { InvoicePaymentPanel } from "@/features/dashboard/subscription/invoice-payment-panel";
import { PlanPicker } from "@/features/dashboard/subscription/plan-picker";
import { subscriptionSummary } from "@/features/dashboard/subscription/subscription-summary";

const PRICES = [
  { plan: "STANDARD" as const, period: "MONTHLY" as const, amountDiram: 15_000 },
  { plan: "PREMIUM" as const, period: "MONTHLY" as const, amountDiram: 30_000 },
  { plan: "PREMIUM" as const, period: "YEARLY" as const, amountDiram: 300_000 },
];

const NOW = new Date("2026-09-10T09:00:00.000Z");

// Vitest runs without `globals`, so Testing Library's automatic cleanup never registers and one
// test's markup would still be on the page while the next one queries it.
afterEach(cleanup);

describe("subscription summary", () => {
  it("counts the days a trial has left", () => {
    const summary = subscriptionSummary({ plan: "PREMIUM", status: "TRIALING", endsAt: new Date("2026-09-15T09:00:00.000Z") }, NOW);
    expect(summary.statusLabel).toBe("Пробный период");
    expect(summary.detail).toContain("осталось 5 дней");
  });

  it("says what grace is about to take away, and when", () => {
    const summary = subscriptionSummary({ plan: "PREMIUM", status: "GRACE", endsAt: new Date("2026-09-05T09:00:00.000Z") }, NOW);
    expect(summary.statusLabel).toBe("Оплата просрочена");
    expect(summary.detail).toContain("12.09.2026");
    expect(summary.detail).toContain("SMS");
    expect(summary.tone).toBe("danger");
  });

  it("names the paid-through date while the subscription is in force", () => {
    const summary = subscriptionSummary({ plan: "STANDARD", status: "ACTIVE", endsAt: new Date("2026-10-01T09:00:00.000Z") }, NOW);
    expect(summary.statusLabel).toBe("Активна");
    expect(summary.detail).toContain("01.10.2026");
  });

  it("does not invent an end date for a subscription that has none", () => {
    const summary = subscriptionSummary({ plan: "PREMIUM", status: "ACTIVE", endsAt: null }, NOW);
    expect(summary.detail).toBe("Бессрочный доступ.");
  });

  it("says plainly what an expired subscription still allows", () => {
    const summary = subscriptionSummary({ plan: "PREMIUM", status: "EXPIRED", endsAt: new Date("2026-08-01T09:00:00.000Z") }, NOW);
    expect(summary.statusLabel).toBe("Закончилась");
    expect(summary.detail).toContain("Записи, клиенты и история на месте");
  });
});

describe("PlanPicker", () => {
  it("shows the price of the chosen plan and period before anything is confirmed", () => {
    render(<PlanPicker currentPlan="STANDARD" prices={PRICES} action={() => undefined} />);

    expect(screen.getByText("150,00 сомони")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Тариф"), { target: { value: "PREMIUM" } });
    expect(screen.getByText("300,00 сомони")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Период"), { target: { value: "YEARLY" } });
    expect(screen.getByText("3 000,00 сомони")).toBeTruthy();
  });

  it("asks to confirm a change of plan, naming what is being bought", () => {
    render(<PlanPicker currentPlan="STANDARD" prices={PRICES} action={() => undefined} />);

    fireEvent.change(screen.getByLabelText("Тариф"), { target: { value: "PREMIUM" } });
    fireEvent.click(screen.getByRole("button", { name: "Выставить счёт" }));

    // Scoped to the dialog: "Премиум" is also one of the options behind it.
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Премиум");
    expect(dialog.textContent).toContain("месяц");
    // Matched without the currency: the amount is tied to «сомони» with a non-breaking space, and an
    // accessible name keeps it verbatim — unlike getByText, which normalises whitespace for us.
    expect(screen.getByRole("button", { name: /Выставить счёт на 300,00/ })).toBeTruthy();
  });

  it("offers only what the platform actually sells", () => {
    render(<PlanPicker currentPlan="START" prices={[PRICES[0]]} action={() => undefined} />);

    const plans = screen.getByLabelText("Тариф") as HTMLSelectElement;
    expect([...plans.options].map((option) => option.value)).toEqual(["STANDARD"]);
    expect(screen.queryByText("Премиум")).toBeNull();
  });
});

describe("InvoicePaymentPanel", () => {
  const invoice = { reference: "SUB-A1B2C3D4", amountDiram: 30_000, plan: "PREMIUM" as const, period: "MONTHLY" as const, status: "OPEN" as const };

  it("shows the amount, the invoice number, the payment link and the receipt upload", () => {
    render(<InvoicePaymentPanel invoice={invoice} paymentUrl="https://pay.expresspay.tj/?A=1" />);

    expect(screen.getByText("300,00 сомони")).toBeTruthy();
    expect(screen.getByText("SUB-A1B2C3D4")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Оплатить переводом" }).getAttribute("href")).toBe("https://pay.expresspay.tj/?A=1");
    expect(screen.getByLabelText("Чек об оплате")).toBeTruthy();
  });

  it("says an operator takes the payment when there is no link to give", () => {
    render(<InvoicePaymentPanel invoice={invoice} paymentUrl={null} />);

    expect(screen.queryByRole("link", { name: "Оплатить переводом" })).toBeNull();
    expect(screen.getByText(/оплату принимает оператор/i)).toBeTruthy();
    // The receipt is still worth sending: the transfer can be made without our link.
    expect(screen.getByLabelText("Чек об оплате")).toBeTruthy();
  });

  it("tells the business its receipt is with an operator rather than lost", () => {
    render(<InvoicePaymentPanel invoice={{ ...invoice, status: "NEEDS_ATTENTION" }} paymentUrl={null} />);

    expect(screen.getByText(/проверяет оператор/i)).toBeTruthy();
  });
});

describe("GraceBanner", () => {
  it("names the date and what stops working, and closes for the session", () => {
    render(<GraceBanner disableAt={new Date("2026-09-12T09:00:00.000Z")} />);

    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain("12.09.2026");
    expect(banner.textContent).toContain("SMS");

    fireEvent.click(screen.getByRole("button", { name: "Скрыть" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
