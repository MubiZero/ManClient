import { describe, expect, it } from "vitest";

import { resolvePrepayment } from "@/core/payments/prepayment-policy";

/**
 * This function decides how much money a customer is asked for, so every case here is a way of asking for
 * the wrong amount: charging the full price when a deposit was configured, charging nothing because a
 * setting was half-finished, or promising a balance at the visit that does not exist.
 */

const FULL = { prepaymentMode: "FULL" as const, depositPercent: null, depositAmountDiram: null };
const PRICE = 20_000;

describe("prepayment policy", () => {
  it("asks for the whole price by default", () => {
    expect(resolvePrepayment(PRICE, FULL)).toEqual({ mode: "FULL", dueDiram: PRICE, totalDiram: PRICE, balanceDiram: 0 });
  });

  it("asks for nothing when the business is paid on the premises", () => {
    expect(resolvePrepayment(PRICE, { ...FULL, prepaymentMode: "NONE" })).toEqual({
      mode: "NONE",
      dueDiram: 0,
      totalDiram: PRICE,
      balanceDiram: PRICE,
    });
  });

  it("rounds a percentage deposit up to whole somoni", () => {
    // 30% of 200.00 is 60.00 exactly; 30% of 199.00 is 59.70 and becomes 60.00 so the customer types a
    // round number into a banking app.
    expect(resolvePrepayment(PRICE, { ...FULL, prepaymentMode: "DEPOSIT", depositPercent: 30 })).toMatchObject({ mode: "DEPOSIT", dueDiram: 6_000, balanceDiram: 14_000 });
    expect(resolvePrepayment(19_900, { ...FULL, prepaymentMode: "DEPOSIT", depositPercent: 30 })).toMatchObject({ dueDiram: 6_000 });
  });

  it("prefers a fixed deposit over a percentage", () => {
    expect(resolvePrepayment(PRICE, { ...FULL, prepaymentMode: "DEPOSIT", depositPercent: 30, depositAmountDiram: 5_000 })).toMatchObject({ dueDiram: 5_000, balanceDiram: 15_000 });
  });

  it("never asks for more than the visit costs", () => {
    expect(resolvePrepayment(3_000, { ...FULL, prepaymentMode: "DEPOSIT", depositAmountDiram: 5_000 })).toEqual({
      mode: "FULL",
      dueDiram: 3_000,
      totalDiram: 3_000,
      balanceDiram: 0,
    });
  });

  it("charges the whole price when a deposit was chosen but never priced", () => {
    // Failing towards the old behaviour: a half-finished setting must not silently make visits free.
    expect(resolvePrepayment(PRICE, { ...FULL, prepaymentMode: "DEPOSIT" })).toMatchObject({ mode: "FULL", dueDiram: PRICE });
  });

  it("lets a service override the business, and only when it states a mode", () => {
    const business = { ...FULL, prepaymentMode: "NONE" as const };
    expect(resolvePrepayment(PRICE, business, { prepaymentMode: "DEPOSIT", depositPercent: 50, depositAmountDiram: null })).toMatchObject({ mode: "DEPOSIT", dueDiram: 10_000 });
    // Deposit fields without a mode of their own are ignored: the business still decides.
    expect(resolvePrepayment(PRICE, business, { prepaymentMode: null, depositPercent: 50, depositAmountDiram: null })).toMatchObject({ mode: "NONE", dueDiram: 0 });
  });

  it("reports a free visit as nothing to prepay", () => {
    // A hundred-percent promo code leaves nothing to transfer, and a payment of zero could never be
    // matched to a receipt — so the visit is settled rather than left waiting for money.
    expect(resolvePrepayment(0, FULL)).toMatchObject({ mode: "NONE", dueDiram: 0, balanceDiram: 0 });
  });
});
