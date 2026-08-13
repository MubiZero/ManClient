import { afterEach, describe, expect, it } from "vitest";

import { BookingPolicyError } from "@/core/bookings/booking-policy";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { cancelVisitForPhone, CustomerVisitError, findCustomerName, listVisitsForPhone } from "@/core/customers/customer-visits";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("customer visits", () => {
  const businessIds: string[] = [];
  afterEach(async () => { await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } }); });

  // The fixture only works Sundays, so every visit here falls on one.
  const now = new Date("2026-08-12T04:00:00.000Z");
  const phone = "+992900771122";

  async function book(
    fixture: Awaited<ReturnType<typeof createBookingFixture>>,
    startsAt: string,
    customerPhone = phone,
    // A visit already in the past has to have been booked in the past too, which is the one thing the
    // booking service will not do from `now`.
    bookedAt = now,
  ) {
    return createPendingBooking(
      {
        businessSlug: fixture.business.slug,
        branchId: fixture.branch.id,
        serviceId: fixture.service.id,
        staffId: fixture.staff.id,
        resourceIds: [],
        startsAt: new Date(startsAt),
        customer: { name: "Далер", phone: customerPhone },
      },
      bookedAt,
    );
  }

  it("puts one number's visits in two salons into a single list", async () => {
    const first = await createBookingFixture();
    const second = await createBookingFixture();
    const other = await createBookingFixture();
    businessIds.push(first.business.id, second.business.id, other.business.id);

    const soon = await book(first, "2026-08-16T05:00:00.000Z");
    const later = await book(second, "2026-08-23T05:00:00.000Z");
    const somebodyElse = await book(other, "2026-08-16T06:00:00.000Z", "+992900771133");

    const visits = await listVisitsForPhone(phone, now);

    expect(visits.upcoming.map((visit) => visit.id)).toEqual([soon.bookingId, later.bookingId]);
    expect(visits.upcoming.map((visit) => visit.id)).not.toContain(somebodyElse.bookingId);
    expect(visits.upcoming[0]).toMatchObject({ businessSlug: first.business.slug, serviceName: "Haircut", staffName: "Alisher" });
  });

  it("moves a finished visit to the history and keeps a cancelled one out of the upcoming list", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const past = await book(fixture, "2026-08-09T05:00:00.000Z", phone, new Date("2026-08-08T04:00:00.000Z"));
    const cancelled = await book(fixture, "2026-08-30T05:00:00.000Z");
    await prisma.booking.update({ where: { id: cancelled.bookingId }, data: { status: "CANCELLED" } });

    const visits = await listVisitsForPhone(phone, now);

    expect(visits.upcoming).toHaveLength(0);
    expect(visits.past.map((visit) => visit.id)).toEqual([cancelled.bookingId, past.bookingId]);
    expect(visits.past.every((visit) => !visit.canCancel && !visit.canReschedule)).toBe(true);
  });

  it("cancels only the caller's own visit, and only while the salon's window is open", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const mine = await book(fixture, "2026-08-16T05:00:00.000Z");
    const theirs = await book(fixture, "2026-08-16T07:00:00.000Z", "+992900771133");

    await expect(cancelVisitForPhone({ phone, bookingId: theirs.bookingId }, now)).rejects.toBeInstanceOf(CustomerVisitError);

    await prisma.business.update({ where: { id: fixture.business.id }, data: { freeCancellationHours: 4 } });
    const tooLate = new Date("2026-08-16T02:00:00.000Z");
    await expect(cancelVisitForPhone({ phone, bookingId: mine.bookingId }, tooLate)).rejects.toBeInstanceOf(BookingPolicyError);

    await cancelVisitForPhone({ phone, bookingId: mine.bookingId }, now);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: mine.bookingId } })).status).toBe("CANCELLED");
  });

  it("remembers the name the number last gave a salon, so a signed-in customer does not retype it", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    await book(fixture, "2026-08-16T05:00:00.000Z");

    expect(await findCustomerName("900 77 11 22")).toBe("Далер");
    expect(await findCustomerName("не телефон")).toBeNull();
  });
});
