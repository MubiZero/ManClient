import { blockedWindow } from "@/core/availability/booking-window";
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
import { BookingStatus, type PaymentStatus } from "@/generated/prisma/client";

/**
 * The calendar's data, shaped for drawing rather than for listing. The list view answers "which bookings
 * exist"; a calendar has to answer "where does the day have room", which means knowing the closed hours,
 * the lunch breaks and the buffers between visits — the same facts the availability sweep uses, but as
 * intervals over a whole day instead of a verdict per candidate slot.
 *
 * A day and a week are the same computation over a different range, so both are built from one load: the
 * week would otherwise issue seven times the queries to answer a question about the same branch.
 */

/** Fallback bounds for a day with nothing in it at all, so the grid still renders a recognisable day. */
const EMPTY_DAY_START_MINUTE = 9 * 60;
const EMPTY_DAY_END_MINUTE = 18 * 60;

/** Days shown in the week view. Monday first, as the working week reads in Tajikistan. */
const WEEK_LENGTH = 7;

/**
 * Cancelled and expired bookings are left out — they never happened and would clutter today's picture.
 * A no-show did happen: the specialist waited, and a day reviewed later must show that hour as spent
 * rather than as time that was quietly free.
 */
const DRAWN_BOOKING_STATUSES = [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED, BookingStatus.NO_SHOW];

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
  /** The price of the visit, not the deposit that was asked for up front. */
  totalDiram: number;
  paymentStatus: PaymentStatus | null;
  /**
   * Horizontal placement among visits that share an hour. A specialist should never be double-booked, but
   * data that predates the buffer rules — or two bookings taken in the same instant — can overlap, and a
   * calendar that draws one on top of the other hides a visit nobody will then prepare for.
   */
  lane: number;
  laneCount: number;
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

/** A week's day holds every specialist's visits in one column, so its lanes span the whole branch. */
export type WeekScheduleBooking = DayScheduleBooking & { staffId: string; staffName: string };

export type WeekScheduleDay = {
  date: string;
  dayStartsAt: Date;
  /** Union across the shown specialists: when the branch has anybody available at all. */
  workingIntervals: MinuteInterval[];
  freeIntervals: MinuteInterval[];
  bookings: WeekScheduleBooking[];
};

export type WeekSchedule = {
  weekStart: string;
  timeZone: string;
  branchId: string;
  branchName: string;
  /** One window for all seven days, so a row of the grid means the same hour in every column. */
  viewStartMinute: number;
  viewEndMinute: number;
  /**
   * Set only when a single specialist is shown. A gap in an aggregated week says "somebody is free", which
   * is not enough to book against — the form would have to guess whom.
   */
  staffId: string | null;
  days: WeekScheduleDay[];
};

type ScheduleInput = {
  businessId: string;
  actorUserId: string;
  branchId?: string;
  staffId?: string;
};

export async function getDaySchedule(input: ScheduleInput & { date: string }): Promise<DaySchedule> {
  const context = await loadScheduleContext(input, input.date, input.date);
  const day = buildDay(context, input.date);

  return {
    date: input.date,
    timeZone: context.branch.timeZone,
    branchId: context.branch.id,
    branchName: context.branch.name,
    dayStartsAt: day.dayStartsAt,
    ...resolveViewBounds([{ columns: day.columns, dayBounds: day.dayBounds }]),
    columns: day.columns,
  };
}

export async function getWeekSchedule(input: ScheduleInput & { date: string }): Promise<WeekSchedule> {
  const weekStart = startOfWeek(input.date);
  const dates = Array.from({ length: WEEK_LENGTH }, (_, offset) => shiftDate(weekStart, offset));
  const context = await loadScheduleContext(input, weekStart, dates.at(-1)!);
  const built = dates.map((date) => ({ date, ...buildDay(context, date) }));

  return {
    weekStart,
    timeZone: context.branch.timeZone,
    branchId: context.branch.id,
    branchName: context.branch.name,
    ...resolveViewBounds(built),
    // The aggregate is only bookable when there is nobody to confuse it with: one specialist selected, or
    // one specialist in the branch at all.
    staffId: context.staffMembers.length === 1 ? context.staffMembers[0].id : null,
    days: built.map((day) => ({
      date: day.date,
      dayStartsAt: day.dayStartsAt,
      workingIntervals: normalizeIntervals(day.columns.flatMap((column) => column.workingIntervals)),
      freeIntervals: normalizeIntervals(day.columns.flatMap((column) => column.freeIntervals)),
      bookings: assignLanes(day.columns.flatMap((column) => column.bookings.map((booking) => ({
        ...booking,
        staffId: column.staffId,
        staffName: column.displayName,
      })))),
    })),
  };
}

type ScheduleContext = Awaited<ReturnType<typeof loadScheduleContext>>;

/**
 * One load for the whole range. Breaks are fetched for every weekday rather than one, because the week
 * needs all of them and a branch has a handful of rows either way.
 */
async function loadScheduleContext(input: ScheduleInput, fromDate: string, toDate: string) {
  const scope = await requireBookingAccess(input);
  // Without an explicit choice a calendar has to pick a branch, and "the oldest one" is the wrong guess for
  // a specialist who works in the second: they would open their own calendar and see somebody else's floor.
  const defaultBranchId = input.branchId ?? (scope.staffId
    ? (await prisma.staffBranch.findFirst({
        where: { staffId: scope.staffId, branch: { businessId: input.businessId, archivedAt: null } },
        orderBy: { isPrimary: "desc" },
        select: { branchId: true },
      }))?.branchId
    : undefined);
  const branch = await prisma.branch.findFirst({
    where: { businessId: input.businessId, archivedAt: null, ...(defaultBranchId ? { id: defaultBranchId } : {}) },
    select: { id: true, name: true, timeZone: true, scheduleRules: true },
    orderBy: { createdAt: "asc" },
  });
  if (!branch) throw new BookingOperationError("NOT_FOUND");

  let rangeStartsAt: Date;
  let rangeEndsAt: Date;
  try {
    rangeStartsAt = localDateTimeToUtc(fromDate, "00:00", branch.timeZone);
    rangeEndsAt = localDateTimeToUtc(shiftDate(toDate, 1), "00:00", branch.timeZone);
  } catch {
    throw new BookingOperationError("INVALID_INPUT");
  }

  // Staff scope mirrors the list view: a specialist opening the calendar sees their own day, not the
  // whole floor's. The explicit filter narrows further for owners looking at one column.
  const staffScope = scope.role === "STAFF" ? scope.staffId ?? "__none__" : input.staffId;
  const drawnInRange = { branchId: branch.id, status: { in: DRAWN_BOOKING_STATUSES }, startsAt: { lt: rangeEndsAt }, endsAt: { gt: rangeStartsAt } };
  const [staffMembers, breaks, exceptions, bookings] = await Promise.all([
    prisma.staffMember.findMany({
      where: {
        businessId: input.businessId,
        branches: { some: { branchId: branch.id } },
        ...(staffScope ? { id: staffScope } : {}),
        OR: [{ archivedAt: null }, { bookings: { some: drawnInRange } }],
      },
      select: { id: true, displayName: true, archivedAt: true, scheduleRules: { where: { branchId: branch.id } } },
      orderBy: { displayName: "asc" },
    }),
    prisma.scheduleBreak.findMany({ where: { branchId: branch.id }, select: { staffId: true, dayOfWeek: true, startsAt: true, endsAt: true } }),
    prisma.scheduleException.findMany({
      where: { branchId: branch.id, startsAt: { lt: rangeEndsAt }, endsAt: { gt: rangeStartsAt } },
      select: { staffId: true, startsAt: true, endsAt: true, available: true },
    }),
    prisma.booking.findMany({
      where: { ...bookingScopeWhere(scope), ...drawnInRange, ...(input.staffId ? { staffId: input.staffId } : {}) },
      select: {
        id: true,
        staffId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        customer: { select: { name: true, phone: true } },
        service: { select: { name: true, durationMinutes: true, bufferBeforeMinutes: true, bufferAfterMinutes: true } },
        payment: { select: { status: true, totalDiram: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return { branch, staffMembers, breaks, exceptions, bookings };
}

function buildDay(context: ScheduleContext, date: string): { dayStartsAt: Date; dayBounds: MinuteInterval; columns: DayScheduleColumn[] } {
  const { branch } = context;
  const dayStartsAt = localDateTimeToUtc(date, "00:00", branch.timeZone);
  const dayEndsAt = localDateTimeToUtc(shiftDate(date, 1), "00:00", branch.timeZone);
  const dayBounds: MinuteInterval = { startMinute: 0, endMinute: minutesFromDayStart(dayEndsAt, dayStartsAt) };
  const dayOfWeek = localWeekday(dayStartsAt, branch.timeZone);
  const toMinute = (time: string) => minutesFromDayStart(localDateTimeToUtc(date, time, branch.timeZone), dayStartsAt);
  const ruleToInterval = (rule: { startsAt: string; endsAt: string }) => ({ startMinute: toMinute(rule.startsAt), endMinute: toMinute(rule.endsAt) });
  const onThisDay = (row: { dayOfWeek: number }) => row.dayOfWeek === dayOfWeek;
  const inThisDay = (value: Date) => value >= dayStartsAt && value < dayEndsAt;

  const branchIntervals = normalizeIntervals(branch.scheduleRules.filter(onThisDay).map(ruleToInterval));
  const columns = context.staffMembers.map((staff) => {
    // Matching the availability sweep exactly: a specialist with any rule of their own for this branch is
    // governed by those rules alone, and only a specialist with none inherits the branch's hours.
    const ownRules = staff.scheduleRules.filter(onThisDay);
    const baseIntervals = staff.scheduleRules.length ? normalizeIntervals(ownRules.map(ruleToInterval)) : branchIntervals;
    const applies = (row: { staffId: string | null }) => row.staffId === null || row.staffId === staff.id;
    const exceptionIntervals = (available: boolean) =>
      context.exceptions
        .filter((item) => item.available === available && applies(item))
        .map((item) => clampInterval({ startMinute: minutesFromDayStart(item.startsAt, dayStartsAt), endMinute: minutesFromDayStart(item.endsAt, dayStartsAt) }, dayBounds))
        .filter((interval): interval is MinuteInterval => interval !== null);

    const opened = normalizeIntervals([...baseIntervals, ...exceptionIntervals(true)]);
    const workingIntervals = subtractIntervals(opened, [
      ...context.breaks.filter((item) => onThisDay(item) && applies(item)).map(ruleToInterval),
      ...exceptionIntervals(false),
    ]);

    const staffBookings: DayScheduleBooking[] = context.bookings
      .filter((booking) => booking.staffId === staff.id && inThisDay(booking.startsAt))
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
          totalDiram: booking.payment?.totalDiram ?? 0,
          paymentStatus: booking.payment?.status ?? null,
          lane: 0,
          laneCount: 1,
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
      bookings: assignLanes(staffBookings),
    } satisfies DayScheduleColumn;
  });

  return { dayStartsAt, dayBounds, columns };
}

/**
 * Side-by-side placement for visits that share an hour. Each booking takes the leftmost lane free at its
 * start, and every booking in an overlapping run reports the same lane count so they end up the same
 * width — otherwise two visits at the same time would be drawn on top of each other and one would be
 * invisible.
 */
function assignLanes<T extends DayScheduleBooking>(bookings: T[]): T[] {
  const ordered = [...bookings].sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
  const laneEnds: number[] = [];
  const placed = ordered.map((booking) => {
    let lane = laneEnds.findIndex((end) => end <= booking.startMinute);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = booking.endMinute;
    return { ...booking, lane, laneCount: 1 };
  });

  // Lane count is per overlapping run rather than per day: one double-booked morning must not shrink
  // every other visit in the week to half width.
  let runStart = 0;
  let runEnd = -1;
  let runMax = 0;
  const flush = (until: number) => {
    for (let index = runStart; index < until; index += 1) placed[index].laneCount = Math.max(1, runMax);
  };
  placed.forEach((booking, index) => {
    if (booking.startMinute >= runEnd && index > runStart) {
      flush(index);
      runStart = index;
      runMax = 0;
    }
    runEnd = Math.max(runEnd, booking.endMinute);
    runMax = Math.max(runMax, booking.lane + 1);
  });
  flush(placed.length);
  return placed;
}

/**
 * The hours worth drawing: everything open or booked, rounded outwards to whole hours so the time gutter
 * reads as clock hours. A visit booked outside working hours — a favour, or an old booking left behind by
 * a schedule change — widens the window rather than being cropped out of the picture.
 */
function resolveViewBounds(
  days: Array<{ columns: DayScheduleColumn[]; dayBounds: MinuteInterval }>,
): { viewStartMinute: number; viewEndMinute: number } {
  const spans = days.flatMap((day) => intersectIntervals(
    day.columns.flatMap((column) => [
      ...column.workingIntervals,
      ...column.bookings.map((booking) => ({ startMinute: booking.blockedStartMinute, endMinute: booking.blockedEndMinute })),
    ]),
    [day.dayBounds],
  ));
  const covered = normalizeIntervals(spans);
  if (covered.length === 0) {
    return { viewStartMinute: EMPTY_DAY_START_MINUTE, viewEndMinute: EMPTY_DAY_END_MINUTE };
  }

  const latestBound = Math.max(...days.map((day) => day.dayBounds.endMinute));
  const startMinute = Math.max(0, Math.floor(covered[0].startMinute / 60) * 60);
  const endMinute = Math.min(latestBound, Math.ceil(covered.at(-1)!.endMinute / 60) * 60);
  return { viewStartMinute: startMinute, viewEndMinute: Math.max(endMinute, startMinute + 60) };
}

function localWeekday(value: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(value);
  const weekday = WEEKDAY_BY_NAME[name];
  if (weekday === undefined) throw new Error("Unable to resolve branch local weekday");
  return weekday;
}

/** Monday of the week the date falls in. Dates are handled as plain calendar days, hence UTC arithmetic. */
export function startOfWeek(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) throw new BookingOperationError("INVALID_INPUT");
  const weekday = value.getUTCDay();
  return shiftDate(date, weekday === 0 ? -6 : 1 - weekday);
}

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new BookingOperationError("INVALID_INPUT");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
