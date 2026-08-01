import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PaymentPage } from "@/features/public-payment/payment-page";

const payment = {
  amountDiram: 5_000,
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

describe("PaymentPage", () => {
  it("shows the visit context and the time remaining to pay", () => {
    const html = renderToStaticMarkup(<PaymentPage token="test-token" initialPayment={payment} paymentUrl="https://pay.example" />);

    expect(html).toContain("Мужская стрижка");
    expect(html).toContain("Алишер");
    expect(html).toContain("2 августа");
    expect(html).toContain("Время для оплаты");
  });

  it("does not offer receipt upload after the booking hold has expired", () => {
    const html = renderToStaticMarkup(
      <PaymentPage
        token="test-token"
        initialPayment={{ ...payment, booking: { ...payment.booking, status: "EXPIRED", expiresAt: new Date("2020-08-02T05:30:00.000Z") } }}
        paymentUrl="https://pay.example"
      />,
    );

    expect(html).toContain("Время оплаты закончилось");
    expect(html).not.toContain("Прикрепить чек");
  });
});
