import { afterEach, describe, expect, it } from "vitest";

import { createManualBooking } from "@/core/booking-operations/booking-command-service";
import { getWeekSchedule, startOfWeek } from "@/core/booking-operations/day-schedule-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * The week answers which day to offer at all, so what matters is that it agrees with the day view about
 * the same facts — one window for all seven columns, closed days visibly closed — and that two visits
 * sharing an hour are both visible instead of one hiding under the other.
 */

/** 2026-08-02 is a Sunday; the week it belongs to starts Monday 2026-07-27. */
const SUNDAY = "2026-08-02";
const WEEK_START = "2026-07-27";
const CREATED_AT = new Date("2026-07-20T04:00:00.000Z");

const businessIds: string[] = [];
const userIds: string[] = [];

describe("week schedule", () => {
  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("starts the week on Monday whichever day it is asked about", () => {
    expect(startOfWeek(SUNDAY)).toBe(WEEK_START);
    expect(startOfWeek(WEEK_START)).toBe(WEEK_START);
    expect(startOfWeek("2026-07-31")).toBe(WEEK_START);
  });

  it("draws seven days, only one of which the branch works", async () => {
    const context = await setup();
    await book(context, context.staff, "10:00", "+992900006001");

    const week = await getWeekSchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: SUNDAY });

    expect(week.weekStart).toBe(WEEK_START);
    expect(week.days.map((day) => day.date)).toEqual([
      "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02",
    ]);
    // The fixture branch works Sundays only, so six columns are closed and carry no free time at all.
    expect(week.days.filter((day) => day.workingIntervals.length > 0).map((day) => day.date)).toEqual([SUNDAY]);
    const sunday = week.days.at(-1)!;
    expect(sunday.workingIntervals).toEqual([{ startMinute: 9 * 60, endMinute: 18 * 60 }]);
    expect(sunday.bookings).toHaveLength(1);
    expect(sunday.bookings[0]).toMatchObject({ startMinute: 600, staffName: "Alisher", lane: 0, laneCount: 1 });
    // One window for the whole week: a row of the grid has to mean the same hour in every column.
    expect(week).toMatchObject({ viewStartMinute: 9 * 60, viewEndMinute: 18 * 60 });
  });

  it("puts two specialists booked at the same hour side by side", async () => {
    const context = await setup();
    const second = await prisma.staffMember.create({
      data: { businessId: context.business.id, displayName: "Зафар", branches: { create: { branchId: context.branch.id } }, services: { connect: { id: context.service.id } } },
    });
    await book(context, context.staff, "10:00", "+992900006002");
    await book(context, second, "10:00", "+992900006003");
    await book(context, context.staff, "14:00", "+992900006004");

    const week = await getWeekSchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: SUNDAY });

    const sunday = week.days.at(-1)!;
    const atTen = sunday.bookings.filter((booking) => booking.startMinute === 600);
    expect(atTen.map((booking) => booking.lane).sort()).toEqual([0, 1]);
    expect(atTen.every((booking) => booking.laneCount === 2)).toBe(true);
    // The lone afternoon visit keeps the full width: one crowded morning must not halve the whole week.
    expect(sunday.bookings.find((booking) => booking.startMinute === 840)).toMatchObject({ lane: 0, laneCount: 1 });
  });

  it("offers bookable gaps only when a single specialist is shown", async () => {
    const context = await setup();
    await prisma.staffMember.create({
      data: { businessId: context.business.id, displayName: "Зафар", branches: { create: { branchId: context.branch.id } }, services: { connect: { id: context.service.id } } },
    });

    const everyone = await getWeekSchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: SUNDAY });
    expect(everyone.staffId).toBeNull();

    const alone = await getWeekSchedule({ businessId: context.business.id, actorUserId: context.ownerId, staffId: context.staff.id, date: SUNDAY });
    expect(alone.staffId).toBe(context.staff.id);
    expect(alone.days.at(-1)!.freeIntervals).toEqual([{ startMinute: 9 * 60, endMinute: 18 * 60 }]);
  });

  it("counts a day free while anybody is free, and stops offering an hour both are busy", async () => {
    const context = await setup();
    const second = await prisma.staffMember.create({
      data: { businessId: context.business.id, displayName: "Зафар", branches: { create: { branchId: context.branch.id } }, services: { connect: { id: context.service.id } } },
    });
    await book(context, context.staff, "10:00", "+992900006005");

    const week = await getWeekSchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: SUNDAY });
    // Alisher is busy 10:00–10:45 but Zafar is not, so the aggregated day still shows the hour as open.
    expect(week.days.at(-1)!.freeIntervals).toEqual([{ startMinute: 9 * 60, endMinute: 18 * 60 }]);

    await book({ ...context, staff: second }, second, "10:00", "+992900006006");
    const busy = await getWeekSchedule({ businessId: context.business.id, actorUserId: context.ownerId, date: SUNDAY });
    expect(busy.days.at(-1)!.freeIntervals).toEqual([
      { startMinute: 9 * 60, endMinute: 10 * 60 },
      { startMinute: 10 * 60 + 45, endMinute: 18 * 60 },
    ]);
  });
});

async function setup() {
  const fixture = await createBookingFixture();
  businessIds.push(fixture.business.id);
  const owner = await prisma.user.create({ data: { email: `owner-week-${fixture.business.id}@test.local`, displayName: "Owner" } });
  await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role: "OWNER" } });
  const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
  userIds.push(owner.id, staffMembership.userId);
  return { ...fixture, ownerId: owner.id };
}

function book(
  context: Awaited<ReturnType<typeof setup>>,
  staff: { id: string },
  time: string,
  phone: string,
) {
  return createManualBooking({
    businessId: context.business.id,
    actorUserId: context.ownerId,
    branchId: context.branch.id,
    serviceId: context.service.id,
    staffId: staff.id,
    startsAt: utc(time),
    customer: { name: "Клиент", phone },
  }, CREATED_AT);
}

/** Dushanbe is UTC+5 and observes no daylight saving, so the offset is a constant five hours. */
function utc(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, 7, 2, hours - 5, minutes));
}
