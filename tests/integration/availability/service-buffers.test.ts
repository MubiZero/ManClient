import { describe, expect, it } from "vitest";

import { getAvailableStarts } from "@/core/availability/availability-service";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * Buffers are the minutes a service costs the specialist beyond the visit — cleaning a chair, getting a
 * car out of the box. The failure they prevent is a calendar that looks bookable and physically is not,
 * so both the sweep that offers slots and the transaction that takes them have to honour them.
 */

const CREATED_AT = new Date("2026-08-01T04:00:00.000Z");
/** 2026-08-02 is a Sunday, the fixture branch's working day. */
const NOON = new Date("2026-08-02T05:00:00.000Z");

describe("service buffers", () => {
  it("blocks the slot a following visit would start in", async () => {
    const fixture = await createBookingFixture();
    // 45-minute haircut plus 30 minutes of cleaning: 05:00 occupies the chair until 06:15.
    await prisma.service.update({ where: { id: fixture.service.id }, data: { bufferAfterMinutes: 30 } });
    await createPendingBooking(bookingInput(fixture, "+992900003001", NOON), CREATED_AT);

    const starts = await getAvailableStarts({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      rangeStartsAt: new Date("2026-08-02T05:00:00.000Z"),
      rangeEndsAt: new Date("2026-08-02T08:00:00.000Z"),
      durationMinutes: 45,
      intervalMinutes: 30,
      now: CREATED_AT,
    });

    // 05:45 would fit the visit but not the cleaning behind it; 06:30 is the first honest offer.
    expect(starts.map((value) => value.toISOString())).toEqual([
      "2026-08-02T06:30:00.000Z",
      "2026-08-02T07:00:00.000Z",
    ]);
  });

  it("blocks the slot before a visit whose service needs preparation", async () => {
    const fixture = await createBookingFixture();
    await prisma.service.update({ where: { id: fixture.service.id }, data: { bufferBeforeMinutes: 30 } });
    await createPendingBooking(bookingInput(fixture, "+992900003002", new Date("2026-08-02T07:00:00.000Z")), CREATED_AT);

    const starts = await getAvailableStarts({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      rangeStartsAt: new Date("2026-08-02T05:30:00.000Z"),
      rangeEndsAt: new Date("2026-08-02T07:00:00.000Z"),
      durationMinutes: 45,
      intervalMinutes: 30,
      now: CREATED_AT,
    });

    // The 07:00 visit is prepared from 06:30, and a candidate at 05:30 also needs its own 30 minutes of
    // preparation before it — leaving 05:30 (ends 06:15) as the last slot that genuinely fits.
    expect(starts.map((value) => value.toISOString())).toEqual(["2026-08-02T05:30:00.000Z"]);
  });

  it("refuses a booking that violates a buffer even when the slot itself is free", async () => {
    const fixture = await createBookingFixture();
    await prisma.service.update({ where: { id: fixture.service.id }, data: { bufferAfterMinutes: 30 } });
    await createPendingBooking(bookingInput(fixture, "+992900003003", NOON), CREATED_AT);

    // 05:45 does not overlap the 05:00–05:45 visit, but it does overlap its cleaning time. The
    // transaction has to refuse it, not only the sweep that offers slots.
    await expect(
      createPendingBooking(bookingInput(fixture, "+992900003004", new Date("2026-08-02T05:45:00.000Z")), CREATED_AT),
    ).rejects.toMatchObject({ name: "BookingValidationError" });
  });

  it("keeps a zero-buffer service behaving exactly as before", async () => {
    const fixture = await createBookingFixture();
    await createPendingBooking(bookingInput(fixture, "+992900003005", NOON), CREATED_AT);

    const starts = await getAvailableStarts({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      rangeStartsAt: new Date("2026-08-02T05:00:00.000Z"),
      rangeEndsAt: new Date("2026-08-02T06:30:00.000Z"),
      durationMinutes: 45,
      intervalMinutes: 45,
      now: CREATED_AT,
    });

    expect(starts.map((value) => value.toISOString())).toEqual(["2026-08-02T05:45:00.000Z"]);
  });
});

function bookingInput(fixture: Awaited<ReturnType<typeof createBookingFixture>>, phone: string, startsAt: Date) {
  return {
    businessSlug: fixture.business.slug,
    branchId: fixture.branch.id,
    serviceId: fixture.service.id,
    staffId: fixture.staff.id,
    resourceIds: [],
    startsAt,
    customer: { name: "Мухаммад", phone },
  };
}
