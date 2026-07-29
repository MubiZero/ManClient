import { describe, expect, it } from "vitest";

import { createPaymentUrl } from "@/integrations/dushanbe-city/payment-link";

describe("createPaymentUrl", () => {
  it("encodes amount in TJS and the booking reference", () => {
    const url = createPaymentUrl({
      cardNumber: "1111222233334444",
      amountDiram: 1_750,
      bookingReference: "MC-1",
    });

    expect(url.origin + url.pathname).toBe("http://pay.expresspay.tj/");
    expect(url.searchParams.get("A")).toBe("1111222233334444");
    expect(url.searchParams.get("s")).toBe("17.50");
    expect(url.searchParams.get("c")).toBe("MC-1");
    expect(url.searchParams.get("f1")).toBe("133");
  });
});
