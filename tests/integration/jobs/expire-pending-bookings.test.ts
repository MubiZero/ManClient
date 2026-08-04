import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { expirePendingBookings } from "@/jobs/expire-pending-bookings";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("expirePendingBookings", () => {
  // This used to be an unfiltered prisma.booking.deleteMany(), which wiped every booking in the
  // database — including the ones other test files were running against at that moment, since the
  // suite runs files in parallel against one database. That single line was the cause of the
  // suite's random failures: bookings vanishing mid-test surfaced as missing records, foreign-key
  // violations and empty result assertions in whichever file lost the race. Each test now scopes
  // the job to its own fixture instead, so nothing needs wiping.

  it("expires only overdue pending-payment bookings", async () => {
    const fixture = await createBookingFixture();
    const booking = await createPendingBooking(
      {
        businessSlug: fixture.business.slug,
        branchId: fixture.branch.id,
        serviceId: fixture.service.id,
        staffId: fixture.staff.id,
        resourceIds: [],
        startsAt: new Date("2026-08-02T05:00:00.000Z"),
        customer: { name: "Мухаммад", phone: "+992900001122" },
      },
      new Date("2026-08-01T04:00:00.000Z"),
    );

    await expect(expirePendingBookings(new Date("2026-08-01T04:16:00.000Z"), { businessId: fixture.business.id })).resolves.toBe(1);
    await expect(prisma.booking.findUnique({ where: { id: booking.bookingId } })).resolves.toMatchObject({
      status: "EXPIRED",
    });
  });

  it("holds an overdue booking while a submitted receipt is inside its review window", async () => {
    const fixture = await createBookingFixture();
    const booking = await createPendingBooking({ businessSlug: fixture.business.slug, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Мухаммад", phone: "+992900001123" } }, new Date("2026-08-01T04:00:00.000Z"));
    await prisma.payment.update({ where: { id: booking.paymentId }, data: { status: "NEEDS_ATTENTION", reviewDeadline: new Date("2026-08-01T08:00:00.000Z") } });
    await prisma.receiptSubmission.create({ data: { businessId: fixture.business.id, paymentId: booking.paymentId, storageKey: `receipts/${booking.paymentId}.jpg`, contentType: "image/jpeg", sizeBytes: 10, status: "NEEDS_REVIEW" } });

    await expect(expirePendingBookings(new Date("2026-08-01T04:16:00.000Z"), { businessId: fixture.business.id })).resolves.toBe(0);
    await expect(prisma.booking.findUnique({ where: { id: booking.bookingId } })).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
    await expect(expirePendingBookings(new Date("2026-08-01T08:01:00.000Z"), { businessId: fixture.business.id })).resolves.toBe(1);
  });
});
