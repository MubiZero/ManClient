import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { getAvailableStartsForService, resolveStaffForStart } from "@/core/availability/any-staff";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

const NOW = new Date("2026-08-01T04:00:00.000Z");
const SUNDAY = "2026-08-02";

/**
 * Booking without naming a specialist. A customer who does not care who cuts their hair was made to
 * choose one anyway, and the choice immediately narrowed the times on offer to that one person's
 * gaps — the form asked a question the customer had no opinion on and charged them slots for it.
 */
describe("any free specialist", () => {
  it("offers the times of every specialist who performs the service, not just one", async () => {
    const fixture = await createBookingFixture();
    const second = await addSecondStaff(fixture);

    // Fill Alisher's 10:00 so the hour survives only through the second specialist.
    await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date(`${SUNDAY}T05:00:00.000Z`),
      customer: { name: "Первый", phone: "+992900007711" },
    }, NOW);

    const forOne = await getAvailableStartsForService({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffIds: [fixture.staff.id],
      from: SUNDAY,
      days: 1,
      now: NOW,
    });
    const forAny = await getAvailableStartsForService({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffIds: [fixture.staff.id, second.id],
      from: SUNDAY,
      days: 1,
      now: NOW,
    });

    const taken = `${SUNDAY}T05:00:00.000Z`;
    expect(forOne.map((start) => start.toISOString())).not.toContain(taken);
    expect(forAny.map((start) => start.toISOString())).toContain(taken);
  });

  it("hands a time to somebody who is actually free at it", async () => {
    const fixture = await createBookingFixture();
    const second = await addSecondStaff(fixture);
    await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date(`${SUNDAY}T05:00:00.000Z`),
      customer: { name: "Первый", phone: "+992900007712" },
    }, NOW);

    await expect(resolveStaffForStart({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      startsAt: new Date(`${SUNDAY}T05:00:00.000Z`),
      now: NOW,
    })).resolves.toBe(second.id);
  });

  it("refuses a time nobody is free at instead of picking somebody busy", async () => {
    const fixture = await createBookingFixture();
    await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date(`${SUNDAY}T05:00:00.000Z`),
      customer: { name: "Первый", phone: "+992900007713" },
    }, NOW);

    await expect(resolveStaffForStart({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      startsAt: new Date(`${SUNDAY}T05:00:00.000Z`),
      now: NOW,
    })).resolves.toBeNull();
  });

  it("spreads the day rather than filling one specialist first", async () => {
    const fixture = await createBookingFixture();
    const second = await addSecondStaff(fixture);
    await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date(`${SUNDAY}T06:00:00.000Z`),
      customer: { name: "Первый", phone: "+992900007714" },
    }, NOW);

    // Both are free at 05:00, but Alisher already has the day's only booking.
    await expect(resolveStaffForStart({
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      startsAt: new Date(`${SUNDAY}T05:00:00.000Z`),
      now: NOW,
    })).resolves.toBe(second.id);
  });

  async function addSecondStaff(fixture: Awaited<ReturnType<typeof createBookingFixture>>) {
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { email: `second-${suffix}@example.test`, displayName: "Зафар" } });
    const membership = await prisma.membership.create({ data: { businessId: fixture.business.id, userId: user.id, role: "STAFF" } });
    const staff = await prisma.staffMember.create({
      data: {
        businessId: fixture.business.id,
        membershipId: membership.id,
        displayName: "Зафар",
        branches: { create: { branchId: fixture.branch.id, isPrimary: true } },
      },
    });
    await prisma.service.update({ where: { id: fixture.service.id }, data: { staffMembers: { connect: { id: staff.id } } } });
    return staff;
  }
});
