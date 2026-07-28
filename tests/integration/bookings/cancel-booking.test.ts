import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { cancelBooking } from "@/core/bookings/cancel-booking";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("cancelBooking", () => {
  it("records the customer actor and releases the slot", async () => {
    const fixture = await createBookingFixture();
    const pending = await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Мухаммад", phone: "+992900001122" },
    }, new Date("2026-08-01T04:00:00.000Z"));
    const customer = await prisma.customer.findFirstOrThrow({ where: { businessId: fixture.business.id, phone: "+992900001122" } });

    await expect(cancelBooking({ bookingId: pending.bookingId, actor: { type: "customer", customerId: customer.id } }, new Date("2026-08-01T04:10:00.000Z"))).resolves.toMatchObject({
      status: "CANCELLED",
      cancelledAt: new Date("2026-08-01T04:10:00.000Z"),
      cancelledBy: `customer:${customer.id}`,
    });
  });
});
