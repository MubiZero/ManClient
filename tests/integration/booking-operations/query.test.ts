import { afterEach, describe, expect, it } from "vitest";

import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { parseBookingFilters } from "@/core/booking-operations/booking-operation-schemas";
import { getBusinessBooking, listBusinessBookings } from "@/core/booking-operations/booking-query-service";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("business booking queries", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("searches the tenant day and returns safe details", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
    userIds.push(staffMembership.userId);
    const owner = await prisma.user.create({ data: { email: `owner-${fixture.business.id}@test.local`, displayName: "Owner" } });
    userIds.push(owner.id);
    await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role: "OWNER" } });
    const created = await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Мухаммад Али", phone: "+992900001122" },
    }, new Date("2026-08-01T04:00:00.000Z"));

    const result = await listBusinessBookings({ businessId: fixture.business.id, actorUserId: owner.id, filters: parseBookingFilters({ date: "2026-08-02", search: "мухаммад" }, fixture.branch.timeZone) });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: created.bookingId, customer: { phone: "+992900001122" }, branch: { id: fixture.branch.id } });
    await expect(getBusinessBooking({ businessId: fixture.business.id, actorUserId: owner.id, bookingId: created.bookingId })).resolves.toMatchObject({ id: created.bookingId, auditEvents: [{ type: "booking.created" }] });
  });

  it("keeps staff and other tenants outside the row scope", async () => {
    const first = await createBookingFixture();
    const second = await createBookingFixture();
    businessIds.push(first.business.id, second.business.id);
    const firstMembership = await prisma.membership.findUniqueOrThrow({ where: { id: first.staff.membershipId! } });
    const secondMembership = await prisma.membership.findUniqueOrThrow({ where: { id: second.staff.membershipId! } });
    userIds.push(firstMembership.userId, secondMembership.userId);
    const created = await createPendingBooking({ businessSlug: first.business.slug, branchId: first.branch.id, serviceId: first.service.id, staffId: first.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Клиент", phone: "+992900001133" } }, new Date("2026-08-01T04:00:00.000Z"));

    const secondList = await listBusinessBookings({ businessId: second.business.id, actorUserId: secondMembership.userId, filters: parseBookingFilters({ view: "list", staffId: first.staff.id }, second.branch.timeZone) });
    expect(secondList.items).toEqual([]);
    await expect(getBusinessBooking({ businessId: first.business.id, actorUserId: secondMembership.userId, bookingId: created.bookingId })).rejects.toMatchObject<Partial<BookingOperationError>>({ code: "FORBIDDEN" });
    await expect(getBusinessBooking({ businessId: second.business.id, actorUserId: secondMembership.userId, bookingId: created.bookingId })).rejects.toMatchObject<Partial<BookingOperationError>>({ code: "NOT_FOUND" });
  });
});
