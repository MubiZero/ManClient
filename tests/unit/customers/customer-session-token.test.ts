import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCustomerSessionToken, verifyCustomerSessionToken } from "@/core/customers/customer-session-token";

describe("customer session token", () => {
  const previousSecret = process.env.AUTH_SECRET;
  const expiresAt = new Date("2026-10-01T00:00:00.000Z");
  const before = new Date("2026-08-13T00:00:00.000Z");
  const after = new Date("2026-10-02T00:00:00.000Z");

  beforeEach(() => { process.env.AUTH_SECRET = "test-secret-with-at-least-thirty-two-characters"; });
  afterEach(() => { process.env.AUTH_SECRET = previousSecret; });

  it("carries the phone in the shape the rest of the product compares against", () => {
    const token = createCustomerSessionToken({ phone: "900 11 22 33", expiresAt });
    expect(verifyCustomerSessionToken(token, before)).toEqual({ phone: "+992900112233", expiresAt });
  });

  it("refuses an edited phone, an edited expiry and a cookie signed with another secret", () => {
    const token = createCustomerSessionToken({ phone: "+992900112233", expiresAt });
    const [phone, expiry, signature] = token.split(".");

    expect(verifyCustomerSessionToken(`+992900112299.${expiry}.${signature}`, before)).toBeNull();
    expect(verifyCustomerSessionToken(`${phone}.${Math.floor(after.getTime() / 1000).toString(36)}.${signature}`, before)).toBeNull();

    process.env.AUTH_SECRET = "another-secret-with-at-least-thirty-two-chars";
    expect(verifyCustomerSessionToken(token, before)).toBeNull();
  });

  it("treats an expired or malformed cookie as signed out rather than as an error", () => {
    const token = createCustomerSessionToken({ phone: "+992900112233", expiresAt });
    expect(verifyCustomerSessionToken(token, after)).toBeNull();
    expect(verifyCustomerSessionToken("nonsense", before)).toBeNull();
    expect(verifyCustomerSessionToken("", before)).toBeNull();
  });
});
