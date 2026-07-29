import { afterEach, describe, expect, it } from "vitest";

import { createBookingActionToken, verifyBookingActionToken } from "@/core/bookings/booking-action-token";

describe("booking action token", () => {
  const previousSecret = process.env.BOOKING_ACTION_SECRET;
  afterEach(() => { process.env.BOOKING_ACTION_SECRET = previousSecret; });

  it("keeps web payment and Telegram actions separate", () => {
    process.env.BOOKING_ACTION_SECRET = "test-secret-with-at-least-thirty-two-characters";
    const expiresAt = new Date("2026-08-02T00:00:00.000Z");
    const token = createBookingActionToken({ paymentId: "payment-1", action: "view_payment", expiresAt });
    expect(verifyBookingActionToken(token, new Date("2026-08-01T00:00:00.000Z"), "view_payment")).toMatchObject({ paymentId: "payment-1", action: "view_payment" });
    expect(() => verifyBookingActionToken(token, new Date("2026-08-01T00:00:00.000Z"), "link_payment")).toThrow("wrong action");
  });
});
