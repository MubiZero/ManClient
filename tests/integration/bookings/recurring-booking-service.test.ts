import { describe, expect, it } from "vitest";

import { reserveAllocation } from "@/core/bookings/booking-allocation";
import { createRecurringBooking } from "@/core/bookings/recurring-booking-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("createRecurringBooking", () => {
  it("creates weekly occurrences, skips a conflicting slot, and links them to one series", async () => {
    const fixture = await createBookingFixture();
    await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: "PREMIUM" } });

    const conflictingCustomer = await prisma.customer.create({
      data: { businessId: fixture.business.id, name: "Conflict", phone: "+992900009999" },
    });
    // Second weekly occurrence (2026-08-09) collides with an existing confirmed booking.
    await reserveAllocation({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      customerId: conflictingCustomer.id,
      resourceIds: [],
      startsAt: new Date("2026-08-09T05:00:00.000Z"),
      durationMinutes: fixture.service.durationMinutes,
      expiresAt: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      amountDiram: fixture.service.amountDiram,
      status: "CONFIRMED",
      source: "DASHBOARD",
    });

    const result = await createRecurringBooking(
      {
        businessId: fixture.business.id,
        branchId: fixture.branch.id,
        serviceId: fixture.service.id,
        staffId: fixture.staff.id,
        customer: { name: "Мухаммад", phone: "+992900001122" },
        startsAt: new Date("2026-08-02T05:00:00.000Z"),
        frequency: "WEEKLY",
        occurrencesTotal: 3,
        source: "WEB",
      },
      new Date("2026-08-01T04:00:00.000Z"),
    );

    expect(result.created).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.created.every((booking) => booking.seriesId === result.seriesId)).toBe(true);
    expect(result.created.map((booking) => booking.seriesIndex).sort()).toEqual([0, 2]);
    expect(result.created.map((booking) => booking.startsAt.toISOString()).sort()).toEqual([
      "2026-08-02T05:00:00.000Z",
      "2026-08-16T05:00:00.000Z",
    ]);

    const series = await prisma.bookingSeries.findUniqueOrThrow({ where: { id: result.seriesId } });
    expect(series.occurrencesTotal).toBe(3);
    expect(series.status).toBe("ACTIVE");
  });

  it("rejects when the business plan does not include recurring bookings", async () => {
    const fixture = await createBookingFixture();

    await expect(
      createRecurringBooking(
        {
          businessId: fixture.business.id,
          branchId: fixture.branch.id,
          serviceId: fixture.service.id,
          staffId: fixture.staff.id,
          customer: { name: "Мухаммад", phone: "+992900001122" },
          startsAt: new Date("2026-08-02T05:00:00.000Z"),
          frequency: "WEEKLY",
          occurrencesTotal: 3,
          source: "WEB",
        },
        new Date("2026-08-01T04:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "PLAN_REQUIRED" });
  });

  it("rejects an occurrence count outside the 2-12 range", async () => {
    const fixture = await createBookingFixture();
    await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: "PREMIUM" } });

    await expect(
      createRecurringBooking(
        {
          businessId: fixture.business.id,
          branchId: fixture.branch.id,
          serviceId: fixture.service.id,
          staffId: fixture.staff.id,
          customer: { name: "Мухаммад", phone: "+992900001122" },
          startsAt: new Date("2026-08-02T05:00:00.000Z"),
          frequency: "WEEKLY",
          occurrencesTotal: 1,
          source: "WEB",
        },
        new Date("2026-08-01T04:00:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(SettingsError);
  });
});
