import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { extendPaymentHold, MAX_HOLD_MINUTES } from "@/core/bookings/hold-extension";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

const NOW = new Date("2026-08-01T04:00:00.000Z");

/**
 * The customer does exactly what the page asks — leaves for a banking app, makes the transfer, comes
 * back — and finds the hold expired and the slot given away. The fifteen minutes were counted against
 * a person who was busy obeying us.
 */
describe("extending a payment hold", () => {
  it("gives the customer more time when they come back to the page", async () => {
    const booking = await createBooking("+992900008801");

    const extended = await extendPaymentHold(booking.paymentId, new Date(NOW.getTime() + 10 * 60_000));

    expect(extended).not.toBeNull();
    expect(extended!.getTime()).toBeGreaterThan(NOW.getTime() + 15 * 60_000);
  });

  it("stops extending eventually, so one open tab cannot hold a slot for ever", async () => {
    const booking = await createBooking("+992900008802");

    const late = new Date(NOW.getTime() + (MAX_HOLD_MINUTES + 1) * 60_000);
    await expect(extendPaymentHold(booking.paymentId, late)).resolves.toBeNull();
  });

  it("does not revive a booking that has already been let go", async () => {
    const booking = await createBooking("+992900008803");
    await prisma.booking.update({ where: { id: booking.bookingId }, data: { status: "EXPIRED" } });

    await expect(extendPaymentHold(booking.paymentId, new Date(NOW.getTime() + 60_000))).resolves.toBeNull();
  });

  it("leaves a paid booking alone: it is not waiting for anything", async () => {
    const booking = await createBooking("+992900008804");
    await prisma.booking.update({ where: { id: booking.bookingId }, data: { status: "CONFIRMED", expiresAt: null } });

    await expect(extendPaymentHold(booking.paymentId, new Date(NOW.getTime() + 60_000))).resolves.toBeNull();
  });

  async function createBooking(phone: string) {
    const fixture = await createBookingFixture();
    return createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Мухаммад", phone },
    }, NOW);
  }
});
