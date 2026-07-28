import { describe, expect, it } from "vitest";

import { decryptCardNumber, encryptCardNumber } from "@/core/payments/card-encryption";

describe("card encryption", () => {
  it("round-trips a card number without storing plaintext", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptCardNumber("1111222233334444", key);

    expect(encrypted).not.toContain("1111222233334444");
    expect(decryptCardNumber(encrypted, key)).toBe("1111222233334444");
  });
});
