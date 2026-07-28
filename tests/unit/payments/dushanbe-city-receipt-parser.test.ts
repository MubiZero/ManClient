import { describe, expect, it } from "vitest";

import { parseDushanbeCityReceipt } from "@/core/payments/dushanbe-city-receipt-recognizer";

describe("parseDushanbeCityReceipt", () => {
  it("extracts receipt fields without retaining the full card number", () => {
    expect(parseDushanbeCityReceipt({
      statusText: "Статус: Успешный",
      date: "27.07.2026",
      time: "16:15:50",
      operationNumber: "1895624290",
      recipientCard: "1111222233334444",
      amount: "1.00",
    })).toEqual({
      operationNumber: "1895624290",
      amountDiram: 100,
      recipientCardSuffix: "4444",
      operationAt: new Date("2026-07-27T11:15:50.000Z"),
      isSuccessful: true,
    });
  });
});
