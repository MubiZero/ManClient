import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PaymentReviewQueue } from "@/features/dashboard/payments/payment-review-queue";

const payment = {
  id: "payment-1",
  amountDiram: 5_000,
  receiptAmountDiram: 4_000,
  recipientCardSuffix: "1953",
  operationAt: new Date("2026-07-29T11:04:00Z"),
  updatedAt: new Date("2026-07-29T11:05:00Z"),
  attentionReason: "AMOUNT_MISMATCH",
  booking: {
    id: "booking-1",
    startsAt: new Date("2026-07-30T05:00:00Z"),
    customer: { name: "Мухаммад", phone: "+992900001122" },
    service: { name: "Мужская стрижка" },
    branch: { name: "Центр", timeZone: "Asia/Dushanbe", recipientCardLast4: "1953" },
    staff: { displayName: "Алишер" },
  },
};

describe("PaymentReviewQueue", () => {
  it("shows an actionable comparison for the selected receipt", () => {
    const html = renderToStaticMarkup(
      <PaymentReviewQueue
        payments={[payment]}
        selected={payment}
        approveAction={() => undefined}
        rejectAction={() => undefined}
      />,
    );

    expect(html).toContain("Сумма не совпадает");
    expect(html).toContain("50,00");
    expect(html).toContain("40,00");
    expect(html).toContain("Подтвердить оплату");
    expect(html).toContain("Отклонить чек");
    expect(html).toContain("Мухаммад");
  });

  it("gives a useful completion state when the queue is empty", () => {
    const html = renderToStaticMarkup(
      <PaymentReviewQueue payments={[]} selected={null} approveAction={() => undefined} rejectAction={() => undefined} />,
    );

    expect(html).toContain("Все чеки проверены");
    expect(html).toContain("Новые спорные чеки появятся здесь");
  });
});
