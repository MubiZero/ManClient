import { describe, expect, it } from "vitest";

import { decryptCardNumber, encryptCardNumber } from "@/core/payments/card-encryption";

describe("card encryption", () => {
  it("round-trips a card number without storing plaintext", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptCardNumber("9762000128351953", key);

    expect(encrypted).not.toContain("9762000128351953");
    expect(decryptCardNumber(encrypted, key)).toBe("9762000128351953");
  });
});
