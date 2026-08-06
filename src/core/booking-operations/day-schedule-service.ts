import { ACTIVE_BOOKING_STATUSES, blockedWindow } from "@/core/availability/booking-window";
import {
  clampInterval,
  intersectIntervals,
  minutesFromDayStart,
  normalizeIntervals,
  subtractIntervals,
  type MinuteInterval,
} from "@/core/availability/day-intervals";
import { bookingScopeWhere, requireBookingAccess } from "@/core/booking-operations/booking-access";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { prisma } from "@/core/database/prisma";
import { localDateTimeToUtc } from "@/core/formatting/dushanbe-date";
import type { BookingStatus, PaymentStatus } from "@/generated/prisma/client";

/**
 * One day of one branch, shaped for drawing rather than for listing. The list view answers "which
 * bookings exist"; a calendar has to answer "where does the day have room", which means knowing the
 * closed hours, the lunch breaks and the buffers between visits — the same facts the availability sweep
 * uses, but as intervals over the whole day instead of a verdict per candidate slot.
 */

/** Fallback bounds for a day with nothing in it at all, so the grid still renders a recognisable day. */
const EMPTY_DAY_START_MINUTE = 9 * 60;
const EMPTY_DAY_END_MINUTE = 18 * 60;

const WEEKDAY_BY_NAME: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type DayScheduleBooking = {
  id: string;
  startsAt: Date;
  startMinute: number;
  endMinute: number;
  /** The visit's own window widened by the service's buffers — what actually blocks the specialist. */
  blockedStartMinute: number;
  blockedEndMinute: number;
  status: BookingStatus;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  durationMinutes: number;
  amountDiram: number;
  paymentStatus: PaymentStatus | null;
};

export type DayScheduleColumn = {
  staffId: string;
  displayName: string;
  /** Archived specialists keep a column while they still have visits nobody has moved yet. */
  archived: boolean;
  workingIntervals: MinuteInterval[];
  freeIntervals: MinuteInterval[];
  bookings: DayScheduleBooking[];
};

export type DaySchedule = {
  date: string;
  timeZone: string;
  branchId: string;
  branchName: string;
  dayStartsAt: Date;
  /** Rendered window, in minutes from the local day's start, padded out to whole hours. */
  viewStartMinute: number;
  viewEndMinute: number;
  columns: DayScheduleColumn[];
};

export async function getDaySchedule(input: {
  businessId: string;
  actorUserId: string;
  branchId?: string;
  staffId?: string;
  date: string;
}): Promise<DaySchedule> {
  const scope = await requireBookingAccess(input);
  const branch = await prisma.branch.findFirst({
    where: { businessId: input.businessId, archivedAt: null, ...(input.branchId ? { id: input.branchId } : {}) },
    select: { id: true, name: true, timeZone: true, scheduleRules: true },
    orderBy: { createdAt: "asc" },
  });
  if (!branch) throw new BookingOperationError("NOT_FOUND");

  let dayStartsAt: Date;
  let dayEndsAt: Date;
  try {
    dayStartsAt = localDateTimeToUtc(input.date, "00:00", branch.timeZone);
    dayEndsAt = localDateTimeToUtc(nextDate(input.date), "00:00", branch.timeZone);
  } catch {
    throw new BookingOperationError("INVALID_INPUT");
  }
  const dayBounds: MinuteInterval = { startMinute: 0, endMinute: minutesFromDayStart(dayEndsAt, dayStartsAt) };
  const dayOfWeek = localWeekday(dayStartsAt, branch.timeZone);
  const toMinute = (time: string) => minutesFromDayStart(localDateTimeToUtc(input.date, time, branch.timeZone), dayStartsAt);
  const ruleToInterval = (rule: { startsAt: string; endsAt: string }) => ({ startMinute: toMinute(rule.startsAt), endMinute: toMinute(rule.endsAt) });

  // Staff scope mirrors the list view: a specialist opening the calendar sees their own day, not the
  // whole floor's. The explicit filter narrows further for owners looking at one column.
  const staffScope = scope.role === "STAFF" ? scope.staffId ?? "__none__" : input.staffId;
  const [staffMembers, breaks, exceptions, bookings] = await Promise.all([
    prisma.staffMember.findMany({
      where: {
        businessId: input.businessId,
        branches: { some: { branchId: branch.id } },
        ...(staffScope ? { id: staffScope } : {}),
        OR: [{ archivedAt: null }, { bookings: { some: { branchId: branch.id, status: { in: ACTIVE_BOOKING_STATUSES }, startsAt: { lt: dayEndsAt }, endsAt: { gt: dayStartsAt } } } }],
      },
      select: { id: true, displayName: true, archivedAt: true, scheduleRules: { where: { branchId: branch.id } } },
      orderBy: { displayName: "asc" },
    }),
    prisma.scheduleBreak.findMany({ where: { branchId: branch.id, dayOfWeek }, select: { staffId: true, startsAt: true, endsAt: true } }),
    prisma.scheduleException.findMany({
      where: { branchId: branch.id, startsAt: { lt: dayEndsAt }, endsAt: { gt: dayStartsAt } },
      select: { staffId: true, startsAt: true, endsAt: true, available: true },
    }),
    prisma.booking.findMany({
      where: {
        ...bookingScopeWhere(scope),
        branchId: branch.id,
        ...(input.staffId ? { staffId: input.staffId } : {}),
        status: { in: ACTIVE_BOOKING_STATUSES },
        startsAt: { lt: dayEndsAt },
        endsAt: { gt: dayStartsAt },
      },
      select: {
        id: true,
        staffId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        customer: { select: { name: true, phone: true } },
        service: { select: { name: true, durationMinutes: true, bufferBeforeMinutes: true, bufferAfterMinutes: true } },
        payment: { select: { status: true, amountDiram: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const branchIntervals = normalizeIntervals(branch.scheduleRules.filter((rule) => rule.dayOfWeek === dayOfWeek).map(ruleToInterval));
  const columns = staffMembers.map((staff) => {
    // Matching the availability sweep exactly: a specialist with any rule of their own for this branch is
    // governed by those rules alone, and only a specialist with none inherits the branch's hours.
    const ownRules = staff.scheduleRules.filter((rule) => rule.dayOfWeek === dayOfWeek);
    const baseIntervals = staff.scheduleRules.length ? normalizeIntervals(ownRules.map(ruleToInterval)) : branchIntervals;
    const applies = (row: { staffId: string | null }) => row.staffId === null || row.staffId === staff.id;
    const exceptionIntervals = (available: boolean) =>
      exceptions
        .filter((item) => item.available === available && applies(item))
        .map((item) => clampInterval({ startMinute: minutesFromDayStart(item.startsAt, dayStartsAt), endMinute: minutesFromDayStart(item.endsAt, dayStartsAt) }, dayBounds))
        .filter((interval): interval is MinuteInterval => interval !== null);

    const opened = normalizeIntervals([...baseIntervals, ...exceptionIntervals(true)]);
    const workingIntervals = subtractIntervals(opened, [
      ...breaks.filter(applies).map(ruleToInterval),
      ...exceptionIntervals(false),
    ]);

    const staffBookings = bookings
      .filter((booking) => booking.staffId === staff.id)
      .map((booking) => {
        const blocked = blockedWindow(booking.startsAt, booking.endsAt, booking.service);
        return {
          id: booking.id,
          startsAt: booking.startsAt,
          startMinute: minutesFromDayStart(booking.startsAt, dayStartsAt),
          endMinute: minutesFromDayStart(booking.endsAt, dayStartsAt),
          blockedStartMinute: minutesFromDayStart(blocked.from, dayStartsAt),
          blockedEndMinute: minutesFromDayStart(blocked.to, dayStartsAt),
          status: booking.status,
          customerName: booking.customer.name,
          customerPhone: booking.customer.phone,
          serviceName: booking.service.name,
          durationMinutes: booking.service.durationMinutes,
          amountDiram: booking.payment?.amountDiram ?? 0,
          paymentStatus: booking.payment?.status ?? null,
        } satisfies DayScheduleBooking;
      });

    return {
      staffId: staff.id,
      displayName: staff.displayName,
      archived: staff.archivedAt !== null,
      workingIntervals,
      // Free time is what is open and not blocked, buffers included — the grid must not offer a gap that
      // the reservation transaction would then refuse.
      freeIntervals: subtractIntervals(
        workingIntervals,
        staffBookings.map((booking) => ({ startMinute: booking.blockedStartMinute, endMinute: booking.blockedEndMinute })),
      ),
      bookings: staffBookings,
    } satisfies DayScheduleColumn;
  });

  return {
    date: input.date,
    timeZone: branch.timeZone,
    branchId: branch.id,
    branchName: branch.name,
    dayStartsAt,
    ...resolveViewBounds(columns, dayBounds),
    columns,
  };
}

/**
 * The hours worth drawing: everything open or booked, rounded outwards to whole hours so the time gutter
 * reads as clock hours. A visit booked outside working hours — a favour, or an old booking left behind by
 * a schedule change — widens the window rather than being cropped out of the picture.
 */
function resolveViewBounds(columns: DayScheduleColumn[], dayBounds: MinuteInterval): { viewStartMinute: number; viewEndMinute: number } {
  const spans = columns.flatMap((column) => [
    ...column.workingIntervals,
    ...column.bookings.map((booking) => ({ startMinute: booking.blockedStartMinute, endMinute: booking.blockedEndMinute })),
  ]);
  const covered = intersectIntervals(spans, [dayBounds]);
  if (covered.length === 0) {
    return { viewStartMinute: EMPTY_DAY_START_MINUTE, viewEndMinute: EMPTY_DAY_END_MINUTE };
  }

  const startMinute = Math.max(dayBounds.startMinute, Math.floor(covered[0].startMinute / 60) * 60);
  const endMinute = Math.min(dayBounds.endMinute, Math.ceil(covered.at(-1)!.endMinute / 60) * 60);
  return { viewStartMinute: startMinute, viewEndMinute: Math.max(endMinute, startMinute + 60) };
}

function localWeekday(value: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(value);
  const weekday = WEEKDAY_BY_NAME[name];
  if (weekday === undefined) throw new Error("Unable to resolve branch local weekday");
  return weekday;
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
