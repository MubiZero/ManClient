import { describe, expect, it } from "vitest";

import { createPaymentUrl } from "@/integrations/dushanbe-city/payment-link";

describe("createPaymentUrl", () => {
  it("encodes amount in TJS and the booking reference", () => {
    const url = createPaymentUrl({
      cardNumber: "9762000128351953",
      amountDiram: 1_750,
      bookingReference: "MC-1",
    });

    expect(url.origin + url.pathname).toBe("http://pay.dc.tj/");
    expect(url.searchParams.get("A")).toBe("9762000128351953");
    expect(url.searchParams.get("s")).toBe("17.50");
    expect(url.searchParams.get("c")).toBe("MC-1");
    expect(url.searchParams.get("f1")).toBe("133");
  });
});
