import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PaymentPage } from "@/features/public-payment/payment-page";

const payment = {
  amountDiram: 5_000,
  totalDiram: 5_000,
  status: "PENDING",
  reviewDeadline: null,
  booking: {
    status: "PENDING_PAYMENT",
    expiresAt: new Date("2050-08-02T05:30:00.000Z"),
    startsAt: new Date("2050-08-02T05:00:00.000Z"),
    customer: { name: "Мухаммад" },
    service: { name: "Мужская стрижка" },
    staff: { displayName: "Алишер" },
    branch: { name: "Центр", timeZone: "Asia/Dushanbe" },
  },
  submissions: [],
  business: { name: "Сартарош", slug: "demo-barber", logoStorageKey: null, brandColor: null },
};

const instructions = { url: "https://pay.example", cardNumber: "1111222233334444", reference: "MC-1", amountDiram: 5_000 };

describe("PaymentPage", () => {
  it("shows the visit context and the time remaining to pay", () => {
    const html = renderToStaticMarkup(
      <PaymentPage token="test-token" initialPayment={payment} instructions={instructions} locale="ru" />,
    );

    expect(html).toContain("Мужская стрижка");
    expect(html).toContain("Алишер");
    expect(html).toContain("2 августа");
    expect(html).toContain("Время для оплаты");
  });

  it("sends the customer back to the salon after the booking hold has expired", () => {
    const html = renderToStaticMarkup(
      <PaymentPage
        token="test-token"
        initialPayment={{ ...payment, booking: { ...payment.booking, status: "EXPIRED", expiresAt: new Date("2020-08-02T05:30:00.000Z") } }}
        instructions={instructions}
        locale="ru"
      />,
    );

    expect(html).toContain("Время оплаты закончилось");
    expect(html).not.toContain("Прикрепить чек");
    expect(html).toContain("Записаться снова");
  });

  it("shows why the business turned the receipt down", () => {
    const html = renderToStaticMarkup(
      <PaymentPage
        token="test-token"
        initialPayment={{ ...payment, status: "REJECTED", reviewReason: "На чеке другая сумма" }}
        instructions={instructions}
        locale="ru"
      />,
    );

    expect(html).toContain("На чеке другая сумма");
    expect(html).toContain("Прикрепить другой чек");
  });
});
