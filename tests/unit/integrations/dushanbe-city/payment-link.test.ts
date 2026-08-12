import { describe, expect, it } from "vitest";

import { createPaymentUrl } from "@/integrations/dushanbe-city/payment-link";

describe("createPaymentUrl", () => {
  it("encodes amount in TJS and the booking reference", () => {
    const url = createPaymentUrl({
      cardNumber: "1111222233334444",
      amountDiram: 1_750,
      bookingReference: "MC-1",
    });

    // The card number travels in the query string, so plain http would hand a stranger on the same
    // Wi-Fi the salon's card and the amount.
    expect(url.origin + url.pathname).toBe("https://pay.expresspay.tj/");
    expect(url.searchParams.get("A")).toBe("1111222233334444");
    expect(url.searchParams.get("s")).toBe("17.50");
    expect(url.searchParams.get("c")).toBe("MC-1");
    expect(url.searchParams.get("f1")).toBe("133");
  });
});
