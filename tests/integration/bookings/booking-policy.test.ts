import { describe, expect, it } from "vitest";

import { getAvailableStarts } from "@/core/availability/availability-service";
import { cancelBooking } from "@/core/bookings/cancel-booking";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { rescheduleBooking } from "@/core/bookings/reschedule-booking";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * The rules a business sets and the product enforces. Before these fields existed the only policy was a
 * paragraph of text that bound nobody, so what matters here is that each rule actually refuses
 * something — and that a business which never touches the settings keeps its old behaviour exactly.
 */

const CREATED_AT = new Date("2026-08-01T04:00:00.000Z");
/** The fixture branch works 09:00–18:00 Dushanbe time on Sundays; 2026-08-02 is a Sunday. */
const VISIT = new Date("2026-08-02T05:00:00.000Z");

describe("booking policy", () => {
  it("leaves an untouched business with no restrictions at all", async () => {
    const fixture = await createBookingFixture();
    const business = await prisma.business.findUniqueOrThrow({ where: { id: fixture.business.id } });

    expect(business).toMatchObject({
      minLeadTimeMinutes: 0,
      maxAdvanceDays: null,
      freeCancellationHours: 0,
      maxCustomerReschedules: null,
    });
  });

  it("hides slots that break the minimum notice from customers but not from staff", async () => {
    const fixture = await createBookingFixture();
    await prisma.business.update({ where: { id: fixture.business.id }, data: { minLeadTimeMinutes: 180 } });
    const query = {
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      rangeStartsAt: new Date("2026-08-02T05:00:00.000Z"),
      rangeEndsAt: new Date("2026-08-02T07:00:00.000Z"),
      durationMinutes: 45,
      intervalMinutes: 60,
      now: new Date("2026-08-02T04:00:00.000Z"),
    };

    // Three hours' notice at 04:00 means nothing before 07:00 is offered.
    await expect(getAvailableStarts({ ...query, actor: "customer" })).resolves.toEqual([]);
    await expect(getAvailableStarts({ ...query, actor: "staff" })).resolves.toEqual([
      new Date("2026-08-02T05:00:00.000Z"),
      new Date("2026-08-02T06:00:00.000Z"),
    ]);
  });

  it("refuses a booking past the horizon and accepts one inside it", async () => {
    const fixture = await createBookingFixture();
    await prisma.business.update({ where: { id: fixture.business.id }, data: { maxAdvanceDays: 7 } });
    const input = {
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      customer: { name: "Мухаммад", phone: "+992900002001" },
    };

    // 2026-08-30 is a Sunday inside working hours but four weeks out.
    await expect(
      createPendingBooking({ ...input, startsAt: new Date("2026-08-30T05:00:00.000Z") }, CREATED_AT),
    ).rejects.toMatchObject({ name: "BookingValidationError" });
    await expect(createPendingBooking({ ...input, startsAt: VISIT }, CREATED_AT)).resolves.toMatchObject({
      bookingId: expect.any(String),
    });
  });

  it("stops a customer cancelling inside the change window but never stops the business", async () => {
    const fixture = await createBookingFixture();
    await prisma.business.update({ where: { id: fixture.business.id }, data: { freeCancellationHours: 24 } });
    const booking = await bookingFor(fixture, "+992900002002");
    const membership = await prisma.membership.findFirstOrThrow({ where: { businessId: fixture.business.id } });

    // Two hours before a visit that needs a day's notice.
    const tooLate = new Date(VISIT.getTime() - 2 * 60 * 60_000);
    await expect(
      cancelBooking({ bookingId: booking.bookingId, actor: { type: "customer", customerId: booking.customerId } }, tooLate),
    ).rejects.toMatchObject({ code: "CANCELLATION_WINDOW_CLOSED", limit: 24 });

    await expect(
      cancelBooking(
        { bookingId: booking.bookingId, actor: { type: "business", businessId: fixture.business.id, membershipId: membership.id } },
        tooLate,
      ),
    ).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("lets the customer cancel while the window is still open", async () => {
    const fixture = await createBookingFixture();
    await prisma.business.update({ where: { id: fixture.business.id }, data: { freeCancellationHours: 24 } });
    const booking = await bookingFor(fixture, "+992900002003");

    await expect(
      cancelBooking({ bookingId: booking.bookingId, actor: { type: "customer", customerId: booking.customerId } }, CREATED_AT),
    ).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("counts customer moves and refuses the one past the limit", async () => {
    const fixture = await createBookingFixture();
    await prisma.business.update({ where: { id: fixture.business.id }, data: { maxCustomerReschedules: 1 } });
    const booking = await bookingFor(fixture, "+992900002004");

    await expect(
      rescheduleBooking({ bookingId: booking.bookingId, customerId: booking.customerId, startsAt: new Date("2026-08-02T06:00:00.000Z") }, CREATED_AT),
    ).resolves.toMatchObject({ rescheduleCount: 1 });

    await expect(
      rescheduleBooking({ bookingId: booking.bookingId, customerId: booking.customerId, startsAt: new Date("2026-08-02T07:00:00.000Z") }, CREATED_AT),
    ).rejects.toMatchObject({ code: "RESCHEDULE_LIMIT_REACHED", limit: 1 });
  });

  it("refuses a customer move once the change window has closed", async () => {
    const fixture = await createBookingFixture();
    await prisma.business.update({ where: { id: fixture.business.id }, data: { freeCancellationHours: 12 } });
    const booking = await bookingFor(fixture, "+992900002005");

    await expect(
      rescheduleBooking(
        { bookingId: booking.bookingId, customerId: booking.customerId, startsAt: new Date("2026-08-02T06:00:00.000Z") },
        new Date(VISIT.getTime() - 60 * 60_000),
      ),
    ).rejects.toMatchObject({ code: "RESCHEDULE_WINDOW_CLOSED", limit: 12 });
  });
});

async function bookingFor(fixture: Awaited<ReturnType<typeof createBookingFixture>>, phone: string) {
  const created = await createPendingBooking(
    {
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: VISIT,
      customer: { name: "Мухаммад", phone },
    },
    CREATED_AT,
  );
  const customer = await prisma.customer.findFirstOrThrow({ where: { businessId: fixture.business.id, phone } });
  return { ...created, customerId: customer.id };
}
