import { describe, expect, it } from "vitest";

import { getAvailableDays } from "@/core/availability/availability-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * Which days are worth tapping. The booking form used to offer a bare date field with no idea what
 * was behind it: the customer guessed a date, waited for the slots of that one day, was told there
 * were none, and guessed again. Three guesses on an expensive mobile connection is where they left.
 */
describe("getAvailableDays", () => {
  it("says which of the next days have room and which do not", async () => {
    const fixture = await createBookingFixture();
    // The fixture's branch works Sundays only, so within any week exactly one day can be free.
    const days = await getAvailableDays({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      from: "2026-08-01",
      days: 9,
      now: new Date("2026-08-01T04:00:00.000Z"),
    });

    expect(days).toHaveLength(9);
    expect(days.map((day) => day.date)).toEqual([
      "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05",
      "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09",
    ]);
    expect(days.filter((day) => day.hasSlots).map((day) => day.date)).toEqual(["2026-08-02", "2026-08-09"]);
  });

  it("closes a day the branch has marked as an exception", async () => {
    const fixture = await createBookingFixture();
    await prisma.scheduleException.create({
      data: {
        branchId: fixture.branch.id,
        startsAt: new Date("2026-08-01T19:00:00.000Z"),
        endsAt: new Date("2026-08-02T19:00:00.000Z"),
        available: false,
        note: "Праздник",
      },
    });

    const days = await getAvailableDays({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      from: "2026-08-01",
      days: 9,
      now: new Date("2026-08-01T04:00:00.000Z"),
    });

    expect(days.filter((day) => day.hasSlots).map((day) => day.date)).toEqual(["2026-08-09"]);
  });
});
