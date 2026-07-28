import { beforeEach, describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { expirePendingBookings } from "@/jobs/expire-pending-bookings";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("expirePendingBookings", () => {
  beforeEach(async () => {
    await prisma.booking.deleteMany();
  });

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

    await expect(expirePendingBookings(new Date("2026-08-01T04:16:00.000Z"))).resolves.toBe(1);
    await expect(prisma.booking.findUnique({ where: { id: booking.bookingId } })).resolves.toMatchObject({
      status: "EXPIRED",
    });
  });
});
