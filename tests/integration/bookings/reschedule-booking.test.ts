import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { rescheduleBooking } from "@/core/bookings/reschedule-booking";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("rescheduleBooking", () => {
  it("moves a booking only when the replacement slot is free", async () => {
    const fixture = await createBookingFixture();
    const booking = await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Мухаммад", phone: "+992900001122" },
    }, new Date("2026-08-01T04:00:00.000Z"));
    const customer = await prisma.customer.findFirstOrThrow({
      where: { phone: "+992900001122", businessId: fixture.business.id },
    });

    await expect(rescheduleBooking({
      bookingId: booking.bookingId,
      customerId: customer.id,
      startsAt: new Date("2026-08-02T06:00:00.000Z"),
    })).resolves.toMatchObject({ startsAt: new Date("2026-08-02T06:00:00.000Z") });
  });

  it("allows only one of two concurrent moves into the same slot", async () => {
    const fixture = await createBookingFixture();
    const first = await createPendingBooking({ businessSlug: fixture.business.slug, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Первый", phone: "+992900001201" } }, new Date("2026-08-01T04:00:00.000Z"));
    const second = await createPendingBooking({ businessSlug: fixture.business.slug, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T06:00:00.000Z"), customer: { name: "Второй", phone: "+992900001202" } }, new Date("2026-08-01T04:00:00.000Z"));
    const [firstCustomer, secondCustomer] = await Promise.all([
      prisma.customer.findFirstOrThrow({ where: { businessId: fixture.business.id, phone: "+992900001201" } }),
      prisma.customer.findFirstOrThrow({ where: { businessId: fixture.business.id, phone: "+992900001202" } }),
    ]);

    const results = await Promise.allSettled([
      rescheduleBooking({ bookingId: first.bookingId, customerId: firstCustomer.id, startsAt: new Date("2026-08-02T07:00:00.000Z") }),
      rescheduleBooking({ bookingId: second.bookingId, customerId: secondCustomer.id, startsAt: new Date("2026-08-02T07:00:00.000Z") }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  });
});
