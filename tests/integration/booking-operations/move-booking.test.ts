import { afterEach, describe, expect, it } from "vitest";

import { createManualBooking, rescheduleBusinessBooking } from "@/core/booking-operations/booking-command-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * Moving a visit across the calendar. Dragging makes two things reachable in one gesture that used to take
 * a form: handing the visit to another specialist, and dropping it hard against a neighbouring booking. The
 * second is why buffers are checked here — the dashboard used to accept a move the customer-facing
 * reservation would have refused.
 */

const CREATED_AT = new Date("2026-08-01T04:00:00.000Z");

const businessIds: string[] = [];
const userIds: string[] = [];

describe("moving a booking", () => {
  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("hands the visit to another specialist who performs the service", async () => {
    const context = await setup();
    const zafar = await addStaff(context, "Зафар", { performsService: true });
    const booking = await book(context, context.staff.id, "10:00", "+992900007001");

    await rescheduleBusinessBooking(
      { businessId: context.business.id, actorUserId: context.ownerId, bookingId: booking.bookingId, staffId: zafar.id, startsAt: utc("12:00") },
      CREATED_AT,
    );

    const moved = await prisma.booking.findUniqueOrThrow({ where: { id: booking.bookingId }, include: { auditEvents: true } });
    expect(moved).toMatchObject({ staffId: zafar.id, startsAt: utc("12:00") });
    const event = moved.auditEvents.find((item) => item.type === "booking.rescheduled");
    expect(event?.metadata).toMatchObject({ previousStaffId: context.staff.id, staffId: zafar.id });
  });

  it("refuses a specialist who does not perform the service", async () => {
    const context = await setup();
    const outsider = await addStaff(context, "Мадина", { performsService: false });
    const booking = await book(context, context.staff.id, "10:00", "+992900007002");

    await expect(
      rescheduleBusinessBooking(
        { businessId: context.business.id, actorUserId: context.ownerId, bookingId: booking.bookingId, staffId: outsider.id, startsAt: utc("12:00") },
        CREATED_AT,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.bookingId } })).resolves.toMatchObject({ staffId: context.staff.id });
  });

  it("refuses a move onto a specialist who is already busy then", async () => {
    const context = await setup();
    const zafar = await addStaff(context, "Зафар", { performsService: true });
    await book(context, zafar.id, "12:00", "+992900007003");
    const booking = await book(context, context.staff.id, "10:00", "+992900007004");

    await expect(
      rescheduleBusinessBooking(
        { businessId: context.business.id, actorUserId: context.ownerId, bookingId: booking.bookingId, staffId: zafar.id, startsAt: utc("12:00") },
        CREATED_AT,
      ),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("refuses a move that lands inside a neighbouring visit's buffer", async () => {
    const context = await setup();
    await prisma.service.update({ where: { id: context.service.id }, data: { bufferAfterMinutes: 30 } });
    await book(context, context.staff.id, "12:00", "+992900007005");
    const booking = await book(context, context.staff.id, "09:00", "+992900007006");

    // The 12:00 visit ends at 12:45 and holds the chair until 13:15, so 13:00 only looks free.
    await expect(
      rescheduleBusinessBooking(
        { businessId: context.business.id, actorUserId: context.ownerId, bookingId: booking.bookingId, startsAt: utc("13:00") },
        CREATED_AT,
      ),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    await expect(
      rescheduleBusinessBooking(
        { businessId: context.business.id, actorUserId: context.ownerId, bookingId: booking.bookingId, startsAt: utc("13:15") },
        CREATED_AT,
      ),
    ).resolves.toMatchObject({ bookingId: booking.bookingId });
  });

  it("keeps a specialist from handing their own visit to a colleague", async () => {
    const context = await setup();
    const zafar = await addStaff(context, "Зафар", { performsService: true });
    const booking = await book(context, context.staff.id, "10:00", "+992900007007");
    const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: context.staff.membershipId! } });

    await expect(
      rescheduleBusinessBooking(
        { businessId: context.business.id, actorUserId: staffMembership.userId, bookingId: booking.bookingId, staffId: zafar.id, startsAt: utc("12:00") },
        CREATED_AT,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Their own calendar is still theirs to rearrange.
    await expect(
      rescheduleBusinessBooking(
        { businessId: context.business.id, actorUserId: staffMembership.userId, bookingId: booking.bookingId, startsAt: utc("12:00") },
        CREATED_AT,
      ),
    ).resolves.toMatchObject({ bookingId: booking.bookingId });
  });
});

async function setup() {
  const fixture = await createBookingFixture();
  businessIds.push(fixture.business.id);
  const owner = await prisma.user.create({ data: { email: `owner-move-${fixture.business.id}@test.local`, displayName: "Owner" } });
  await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role: "OWNER" } });
  const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
  userIds.push(owner.id, staffMembership.userId);
  return { ...fixture, ownerId: owner.id };
}

function addStaff(context: Awaited<ReturnType<typeof setup>>, displayName: string, options: { performsService: boolean }) {
  return prisma.staffMember.create({
    data: {
      businessId: context.business.id,
      displayName,
      branches: { create: { branchId: context.branch.id } },
      ...(options.performsService ? { services: { connect: { id: context.service.id } } } : {}),
    },
  });
}

function book(context: Awaited<ReturnType<typeof setup>>, staffId: string, time: string, phone: string) {
  return createManualBooking({
    businessId: context.business.id,
    actorUserId: context.ownerId,
    branchId: context.branch.id,
    serviceId: context.service.id,
    staffId,
    startsAt: utc(time),
    customer: { name: "Клиент", phone },
  }, CREATED_AT);
}

/** 2026-08-02 is a Sunday, the fixture branch's working day; Dushanbe is a constant UTC+5. */
function utc(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, 7, 2, hours - 5, minutes));
}
