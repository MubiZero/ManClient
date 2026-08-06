import { afterEach, describe, expect, it } from "vitest";

import { markBusinessBookingNoShow } from "@/core/booking-operations/booking-command-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * A no-show is not a cancellation: nobody freed the slot, the specialist waited, and the money that had
 * already arrived stays with the business. The failures worth guarding are asking a customer who never
 * came how their visit went, losing the record of the hour, and letting a receptionist mark a visit that
 * has not happened yet — which would be a slip of the mouse, not a decision.
 */

const VISIT = new Date("2026-08-02T05:00:00.000Z");
const AFTER_VISIT = new Date("2026-08-02T07:00:00.000Z");

const businessIds: string[] = [];
const userIds: string[] = [];

describe("no-show", () => {
  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("records the missed visit, keeps the deposit and stops the follow-up messages", async () => {
    const context = await setup({ paymentStatus: "RECEIPT_ACCEPTED", amountDiram: 1_500 });
    await prisma.message.create({ data: { businessId: context.business.id, bookingId: context.bookingId, channel: "WHATSAPP", kind: "BOOKING_REMINDER", scheduledAt: VISIT } });

    const result = await markBusinessBookingNoShow({ businessId: context.business.id, actorUserId: context.ownerId, bookingId: context.bookingId }, AFTER_VISIT);

    expect(result).toMatchObject({ forfeitedDiram: 1_500 });
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: context.bookingId }, include: { payment: true, messages: true, auditEvents: true } });
    expect(booking.status).toBe("NO_SHOW");
    expect(booking.payment?.forfeitedAt).toEqual(AFTER_VISIT);
    expect(booking.messages.map((message) => message.status)).toEqual(["SKIPPED"]);
    expect(booking.auditEvents.map((event) => event.type)).toContain("booking.no_show");
    await expect(prisma.customer.findUniqueOrThrow({ where: { id: context.customerId } })).resolves.toMatchObject({ noShowCount: 1 });
  });

  it("forfeits nothing when no money had arrived", async () => {
    const context = await setup({ paymentStatus: "NOT_REQUIRED", amountDiram: 0 });

    const result = await markBusinessBookingNoShow({ businessId: context.business.id, actorUserId: context.ownerId, bookingId: context.bookingId }, AFTER_VISIT);

    expect(result).toMatchObject({ forfeitedDiram: 0 });
    await expect(prisma.payment.findUniqueOrThrow({ where: { bookingId: context.bookingId } })).resolves.toMatchObject({ forfeitedAt: null });
  });

  it("refuses a visit that has not happened yet", async () => {
    const context = await setup({ paymentStatus: "RECEIPT_ACCEPTED", amountDiram: 5_000 });

    await expect(
      markBusinessBookingNoShow({ businessId: context.business.id, actorUserId: context.ownerId, bookingId: context.bookingId }, new Date("2026-08-02T04:00:00.000Z")),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
  });

  it("refuses a booking nobody confirmed and is idempotent once marked", async () => {
    const context = await setup({ paymentStatus: "PENDING", amountDiram: 5_000, status: "PENDING_PAYMENT" });
    await expect(
      markBusinessBookingNoShow({ businessId: context.business.id, actorUserId: context.ownerId, bookingId: context.bookingId }, AFTER_VISIT),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });

    const confirmed = await setup({ paymentStatus: "RECEIPT_ACCEPTED", amountDiram: 1_000 });
    await markBusinessBookingNoShow({ businessId: confirmed.business.id, actorUserId: confirmed.ownerId, bookingId: confirmed.bookingId }, AFTER_VISIT);
    await markBusinessBookingNoShow({ businessId: confirmed.business.id, actorUserId: confirmed.ownerId, bookingId: confirmed.bookingId }, AFTER_VISIT);
    // Counted once: a second click must not make the customer look twice as unreliable.
    await expect(prisma.customer.findUniqueOrThrow({ where: { id: confirmed.customerId } })).resolves.toMatchObject({ noShowCount: 1 });
  });
});

async function setup(payment: { paymentStatus: "RECEIPT_ACCEPTED" | "PENDING" | "NOT_REQUIRED"; amountDiram: number; status?: "CONFIRMED" | "PENDING_PAYMENT" }) {
  const fixture = await createBookingFixture();
  businessIds.push(fixture.business.id);
  const owner = await prisma.user.create({ data: { email: `owner-noshow-${fixture.business.id}@test.local`, displayName: "Owner" } });
  userIds.push(owner.id);
  await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role: "OWNER" } });
  const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
  userIds.push(staffMembership.userId);
  const customer = await prisma.customer.create({ data: { businessId: fixture.business.id, name: "Не пришёл", phone: `+9929${String(Date.now()).slice(-8)}` } });
  const booking = await prisma.booking.create({
    data: {
      businessId: fixture.business.id,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      customerId: customer.id,
      startsAt: VISIT,
      endsAt: new Date(VISIT.getTime() + 45 * 60_000),
      status: payment.status ?? "CONFIRMED",
      confirmedAt: VISIT,
      payment: { create: { businessId: fixture.business.id, amountDiram: payment.amountDiram, totalDiram: 5_000, status: payment.paymentStatus } },
    },
  });
  return { ...fixture, ownerId: owner.id, bookingId: booking.id, customerId: customer.id };
}
