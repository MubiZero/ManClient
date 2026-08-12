import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { getPaymentInstructions } from "@/core/payments/payment-service";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * The payment page used to offer nothing but a link to ExpressPay. A customer banking with anyone
 * else had no card number to transfer to and no reference to write on the transfer — the page asked
 * for a receipt of a payment it had made impossible.
 */
describe("getPaymentInstructions", () => {
  it("hands the customer everything a manual transfer needs", async () => {
    const fixture = await createBookingFixture();
    const booking = await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Мухаммад", phone: "+992900004455" },
    // The fixture's branch works Sundays; both the slot and "now" are pinned so the test does not
    // rot the way a real-clock date would.
    }, new Date("2026-08-01T04:00:00.000Z"));

    const instructions = await getPaymentInstructions(booking.paymentId);

    expect(instructions.cardNumber).toBe("1111222233334444");
    expect(instructions.reference).toBe(`MC-${booking.bookingId}`);
    expect(instructions.amountDiram).toBeGreaterThan(0);
    // The link stays as a shortcut for customers whose bank it does open.
    expect(instructions.url).toContain("https://pay.expresspay.tj/");
  });
});
