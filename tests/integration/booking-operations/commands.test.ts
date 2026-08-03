import { afterEach, describe, expect, it } from "vitest";

import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { cancelBusinessBooking, confirmBusinessBooking, createManualBooking, rescheduleBusinessBooking } from "@/core/booking-operations/booking-command-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("business booking commands", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  afterEach(async () => { await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } }); await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } }); });

  it("creates, reschedules and cancels a manual confirmed booking with audit", async () => {
    const fixture = await createBookingFixture(); businessIds.push(fixture.business.id);
    const owner = await prisma.user.create({ data: { email: `owner-command-${fixture.business.id}@test.local`, displayName: "Owner" } }); userIds.push(owner.id);
    const membership = await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role: "OWNER" } });
    const created = await createManualBooking({ businessId: fixture.business.id, actorUserId: owner.id, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Ручной клиент", phone: "+992900001144" } }, new Date("2026-08-01T04:00:00.000Z"));
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: created.bookingId }, include: { payment: true } })).resolves.toMatchObject({ status: "CONFIRMED", source: "DASHBOARD", expiresAt: null, confirmedBy: `membership:${membership.id}`, payment: { status: "PENDING" } });

    await rescheduleBusinessBooking({ businessId: fixture.business.id, actorUserId: owner.id, bookingId: created.bookingId, startsAt: new Date("2026-08-02T06:00:00.000Z") }, new Date("2026-08-01T04:30:00.000Z"));
    await cancelBusinessBooking({ businessId: fixture.business.id, actorUserId: owner.id, bookingId: created.bookingId, reason: "Клиент попросил отменить" }, new Date("2026-08-01T05:00:00.000Z"));
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: created.bookingId }, include: { auditEvents: true } });
    expect(stored).toMatchObject({ startsAt: new Date("2026-08-02T06:00:00.000Z"), status: "CANCELLED", cancellationReason: "Клиент попросил отменить" });
    expect(stored.auditEvents.map((event) => event.type)).toEqual(expect.arrayContaining(["booking.created", "booking.rescheduled", "booking.cancelled"]));
  });

  it("confirms pending without faking receipt and blocks staff from another booking", async () => {
    const fixture = await createBookingFixture(); businessIds.push(fixture.business.id);
    const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } }); userIds.push(staffMembership.userId);
    const customer = await prisma.customer.create({ data: { businessId: fixture.business.id, name: "Pending", phone: "+992900001155" } });
    const booking = await prisma.booking.create({ data: { businessId: fixture.business.id, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, customerId: customer.id, startsAt: new Date("2026-08-02T05:00:00.000Z"), endsAt: new Date("2026-08-02T05:45:00.000Z"), expiresAt: new Date("2026-08-01T05:00:00.000Z"), payment: { create: { businessId: fixture.business.id, amountDiram: 5000 } } } });
    await confirmBusinessBooking({ businessId: fixture.business.id, actorUserId: staffMembership.userId, bookingId: booking.id }, new Date("2026-08-01T04:10:00.000Z"));
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { payment: true } })).resolves.toMatchObject({ status: "CONFIRMED", payment: { status: "PENDING", receiptAcceptedAt: null } });

    const outsider = await createBookingFixture(); businessIds.push(outsider.business.id);
    const outsiderMembership = await prisma.membership.findUniqueOrThrow({ where: { id: outsider.staff.membershipId! } }); userIds.push(outsiderMembership.userId);
    await expect(confirmBusinessBooking({ businessId: fixture.business.id, actorUserId: outsiderMembership.userId, bookingId: booking.id })).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<BookingOperationError>);
  });
});
