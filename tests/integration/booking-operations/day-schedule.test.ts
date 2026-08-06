import { afterEach, describe, expect, it } from "vitest";

import { getDaySchedule } from "@/core/booking-operations/day-schedule-service";
import { createManualBooking } from "@/core/booking-operations/booking-command-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * The calendar's promise is that the picture matches what the booking transaction will accept. These
 * cases are the ways that promise breaks: hours the branch is closed shown as open, a break shown as
 * bookable, buffers ignored so a gap is offered that would then be refused, and a specialist seeing a
 * colleague's clients.
 */

/** The fixture branch works 09:00–18:00 Dushanbe time on Sundays; 2026-08-02 is a Sunday. */
const DATE = "2026-08-02";
const CREATED_AT = new Date("2026-08-01T04:00:00.000Z");

const businessIds: string[] = [];
const userIds: string[] = [];

describe("day schedule", () => {
  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("draws the working day, the visit and the free time around it", async () => {
    const context = await setup();
    await book(context, "10:00", "+992900004001");

    const day = await getDaySchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: DATE });

    expect(day).toMatchObject({ timeZone: "Asia/Dushanbe", viewStartMinute: 9 * 60, viewEndMinute: 18 * 60 });
    const column = day.columns[0];
    expect(column.workingIntervals).toEqual([{ startMinute: 9 * 60, endMinute: 18 * 60 }]);
    expect(column.bookings).toHaveLength(1);
    expect(column.bookings[0]).toMatchObject({ startMinute: 10 * 60, endMinute: 10 * 60 + 45, customerName: "Клиент", status: "CONFIRMED" });
    expect(column.freeIntervals).toEqual([
      { startMinute: 9 * 60, endMinute: 10 * 60 },
      { startMinute: 10 * 60 + 45, endMinute: 18 * 60 },
    ]);
  });

  it("keeps buffers out of the free time it offers", async () => {
    const context = await setup();
    await prisma.service.update({ where: { id: context.service.id }, data: { bufferBeforeMinutes: 15, bufferAfterMinutes: 30 } });
    await book(context, "10:00", "+992900004002");

    const day = await getDaySchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: DATE });

    const column = day.columns[0];
    expect(column.bookings[0]).toMatchObject({ startMinute: 600, endMinute: 645, blockedStartMinute: 585, blockedEndMinute: 675 });
    // The visit runs 10:00–10:45, but the chair is taken 09:45–11:15 and the calendar says so.
    expect(column.freeIntervals).toEqual([
      { startMinute: 9 * 60, endMinute: 9 * 60 + 45 },
      { startMinute: 11 * 60 + 15, endMinute: 18 * 60 },
    ]);
  });

  it("cuts out lunch and a closed afternoon", async () => {
    const context = await setup();
    await prisma.scheduleBreak.create({ data: { branchId: context.branch.id, dayOfWeek: 0, startsAt: "13:00", endsAt: "14:00" } });
    await prisma.scheduleException.create({
      data: { branchId: context.branch.id, startsAt: utc("16:00"), endsAt: utc("18:00"), available: false, note: "Учёт" },
    });

    const day = await getDaySchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: DATE });

    expect(day.columns[0].workingIntervals).toEqual([
      { startMinute: 9 * 60, endMinute: 13 * 60 },
      { startMinute: 14 * 60, endMinute: 16 * 60 },
    ]);
  });

  it("opens hours the weekly schedule does not cover when an exception says so", async () => {
    const context = await setup();
    // 2026-08-03 is a Monday, which the fixture branch does not work at all.
    await prisma.scheduleException.create({
      data: { branchId: context.branch.id, startsAt: new Date("2026-08-03T05:00:00.000Z"), endsAt: new Date("2026-08-03T08:00:00.000Z"), available: true },
    });

    const day = await getDaySchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: "2026-08-03" });

    expect(day.columns[0].workingIntervals).toEqual([{ startMinute: 10 * 60, endMinute: 13 * 60 }]);
  });

  it("gives a specialist their own hours instead of the branch's", async () => {
    const context = await setup();
    await prisma.staffScheduleRule.create({ data: { staffId: context.staff.id, branchId: context.branch.id, dayOfWeek: 0, startsAt: "12:00", endsAt: "16:00" } });

    const day = await getDaySchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: DATE });

    expect(day.columns[0].workingIntervals).toEqual([{ startMinute: 12 * 60, endMinute: 16 * 60 }]);
    expect(day).toMatchObject({ viewStartMinute: 12 * 60, viewEndMinute: 16 * 60 });
  });

  it("falls back to a recognisable day when nothing is scheduled at all", async () => {
    const context = await setup();

    // 2026-08-04 is a Tuesday: the branch is closed and nobody is booked.
    const day = await getDaySchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: "2026-08-04" });

    expect(day).toMatchObject({ viewStartMinute: 9 * 60, viewEndMinute: 18 * 60 });
    expect(day.columns[0]).toMatchObject({ workingIntervals: [], freeIntervals: [], bookings: [] });
  });

  it("shows a specialist only their own column", async () => {
    const context = await setup();
    const second = await prisma.staffMember.create({
      data: { businessId: context.business.id, displayName: "Зафар", branches: { create: { branchId: context.branch.id } }, services: { connect: { id: context.service.id } } },
    });
    await book(context, "10:00", "+992900004003");
    await book({ ...context, staff: second }, "11:00", "+992900004004");

    const owner = await getDaySchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: DATE });
    expect(owner.columns.map((column) => column.displayName)).toEqual(["Alisher", "Зафар"]);

    const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: context.staff.membershipId! } });
    const own = await getDaySchedule({ businessId: context.business.id, actorUserId: staffMembership.userId, date: DATE });
    expect(own.columns).toHaveLength(1);
    expect(own.columns[0].bookings.map((booking) => booking.customerPhone)).toEqual(["+992900004003"]);
  });

  it("refuses a date it cannot read", async () => {
    const context = await setup();

    await expect(getDaySchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: "02.08.2026" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

async function setup() {
  const fixture = await createBookingFixture();
  businessIds.push(fixture.business.id);
  const owner = await prisma.user.create({ data: { email: `owner-day-${fixture.business.id}@test.local`, displayName: "Owner" } });
  await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role: "OWNER" } });
  const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
  userIds.push(owner.id, staffMembership.userId);
  return { ...fixture, ownerId: owner.id };
}

function book(context: Awaited<ReturnType<typeof setup>>, time: string, phone: string) {
  return createManualBooking({
    businessId: context.business.id,
    actorUserId: context.ownerId,
    branchId: context.branch.id,
    serviceId: context.service.id,
    staffId: context.staff.id,
    startsAt: utc(time),
    customer: { name: "Клиент", phone },
  }, CREATED_AT);
}

/** Dushanbe is UTC+5 and observes no daylight saving, so the offset is a constant five hours. */
function utc(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, 7, 2, hours - 5, minutes));
}
