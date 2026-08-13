import { prisma } from "@/core/database/prisma";
import { blockedWindow, listOccupiedWindows, windowsOverlap } from "@/core/availability/booking-window";
import { localDateTimeToUtc, todayInTimeZone } from "@/core/formatting/dushanbe-date";

type AvailabilityQuery = {
  branchId: string;
  serviceId: string;
  staffId: string;
  resourceIds: string[];
  rangeStartsAt: Date;
  rangeEndsAt: Date;
  durationMinutes: number;
  intervalMinutes: number;
  excludeBookingId?: string;
  /**
   * Whose rules apply. `customer` honours the business's booking policy — minimum notice and how far
   * ahead bookings are accepted. `staff` ignores both: a receptionist booking the walk-in standing at
   * the counter must not be told the business requires two hours' notice. Service buffers are physical
   * and apply to both.
   */
  actor?: "customer" | "staff";
  /** Injected clock, so policy windows are testable without waiting for the day to move. */
  now?: Date;
};

const WEEKDAY_BY_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** How far ahead the date strip may ask about. Enough for a month, bounded so nobody sweeps a year. */
const MAX_DAYS_AHEAD = 31;

export type AvailableDay = { date: string; hasSlots: boolean };

/**
 * Which of the coming days have room, so the customer can be shown a strip of dates instead of a
 * blank date field. Before this the form knew about one day at a time: a customer picked a date,
 * waited, was told there was nothing, and picked again — and left after the third guess.
 *
 * One sweep over the whole range rather than a query per day: the underlying availability already
 * takes a range, and the policy window (minimum notice, booking horizon) is applied inside it, so a
 * day beyond what the business accepts simply comes back empty.
 */
export async function getAvailableDays(query: {
  branchId: string;
  serviceId: string;
  staffId: string;
  from: string;
  days: number;
  now?: Date;
}): Promise<AvailableDay[]> {
  const days = Math.min(Math.max(Math.trunc(query.days), 1), MAX_DAYS_AHEAD);
  const service = await prisma.service.findFirst({
    where: {
      id: query.serviceId,
      branchId: query.branchId,
      archivedAt: null,
      isPublished: true,
      staffMembers: { some: { id: query.staffId } },
    },
    select: {
      durationMinutes: true,
      branch: { select: { timeZone: true } },
      resources: { select: { resourceId: true } },
    },
  });
  if (!service) return [];

  const timeZone = service.branch.timeZone;
  const dates = Array.from({ length: days }, (_, offset) => addDays(query.from, offset));
  const starts = await getAvailableStarts({
    branchId: query.branchId,
    serviceId: query.serviceId,
    staffId: query.staffId,
    resourceIds: service.resources.map(({ resourceId }) => resourceId),
    rangeStartsAt: localDateTimeToUtc(query.from, "00:00", timeZone),
    rangeEndsAt: localDateTimeToUtc(addDays(query.from, days), "00:00", timeZone),
    durationMinutes: service.durationMinutes,
    intervalMinutes: 30,
    now: query.now,
  });

  // Grouped by the branch's own day, not the server's: a slot at 01:00 in Dushanbe is the previous
  // day in UTC, and the customer is choosing days as the salon counts them.
  const free = new Set(starts.map((start) => todayInTimeZone(timeZone, start)));
  return dates.map((date) => ({ date, hasSlots: free.has(date) }));
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function getAvailableStarts(query: AvailabilityQuery): Promise<Date[]> {
  if (!Number.isInteger(query.durationMinutes) || query.durationMinutes <= 0) {
    throw new Error("Duration must be a positive integer");
  }

  if (!Number.isInteger(query.intervalMinutes) || query.intervalMinutes <= 0) {
    throw new Error("Interval must be a positive integer");
  }

  const [branch, service, staff, resourceCount] = await Promise.all([
    prisma.branch.findFirst({
      where: { id: query.branchId, archivedAt: null },
      include: {
        business: { select: { minLeadTimeMinutes: true, maxAdvanceDays: true } },
        scheduleRules: true,
        scheduleBreaks: { where: { OR: [{ staffId: null }, { staffId: query.staffId }] } },
        scheduleExceptions: { where: { startsAt: { lt: query.rangeEndsAt }, endsAt: { gt: query.rangeStartsAt }, OR: [{ staffId: null }, { staffId: query.staffId }] } },
      },
    }),
    prisma.service.findFirst({ where: { id: query.serviceId, branchId: query.branchId, archivedAt: null, isPublished: true, staffMembers: { some: { id: query.staffId, archivedAt: null, branches: { some: { branchId: query.branchId } } } } }, select: { id: true, bufferBeforeMinutes: true, bufferAfterMinutes: true } }),
    prisma.staffMember.findFirst({ where: { id: query.staffId, archivedAt: null, branches: { some: { branchId: query.branchId } } }, include: { scheduleRules: { where: { branchId: query.branchId } } } }),
    query.resourceIds.length ? prisma.resource.count({ where: { id: { in: query.resourceIds }, branchId: query.branchId, archivedAt: null, isAvailable: true } }) : Promise.resolve(0),
  ]);

  if (!branch || !service || !staff || resourceCount !== new Set(query.resourceIds).size) return [];
  const effectiveRules = staff.scheduleRules.length ? staff.scheduleRules : branch.scheduleRules;
  const policy = resolvePolicyBounds(branch.business, query);

  // One query for the whole range instead of one per candidate slot: a nine-hour day at half-hour
  // intervals used to mean eighteen round trips to answer a single "what is free on Tuesday".
  const occupied = await listOccupiedWindows({
    branchId: query.branchId,
    staffId: query.staffId,
    resourceIds: query.resourceIds,
    rangeStartsAt: query.rangeStartsAt,
    rangeEndsAt: query.rangeEndsAt,
    excludeBookingId: query.excludeBookingId,
  });

  const availableStarts: Date[] = [];
  const lastStartTime = query.rangeEndsAt.getTime() - query.durationMinutes * 60_000;

  for (
    let candidateTime = query.rangeStartsAt.getTime();
    candidateTime <= lastStartTime;
    candidateTime += query.intervalMinutes * 60_000
  ) {
    const startsAt = new Date(candidateTime);
    const endsAt = new Date(candidateTime + query.durationMinutes * 60_000);

    if (startsAt < policy.earliestStart || (policy.latestStart && startsAt > policy.latestStart)) continue;

    const availableException = branch.scheduleExceptions.some(item => item.available && item.startsAt <= startsAt && item.endsAt >= endsAt);
    const unavailableException = branch.scheduleExceptions.some(item => !item.available && item.startsAt < endsAt && item.endsAt > startsAt);
    const withinBreak = isWithinSchedule(startsAt, endsAt, branch.timeZone, branch.scheduleBreaks);
    if (unavailableException || (!availableException && !isWithinSchedule(startsAt, endsAt, branch.timeZone, effectiveRules)) || withinBreak) {
      continue;
    }

    // The candidate blocks its own buffers too, so a service needing fifteen minutes of cleaning after
    // it cannot start fifteen minutes before another visit.
    const candidateWindow = blockedWindow(startsAt, endsAt, service);
    if (occupied.some((slot) => windowsOverlap(candidateWindow, slot))) continue;

    availableStarts.push(startsAt);
  }

  return availableStarts;
}

/**
 * Turns the business's policy into two instants. Kept separate from the loop so the same numbers can be
 * reported to a caller that needs to explain *why* a slot was refused rather than just omit it.
 */
export function resolvePolicyBounds(
  policy: { minLeadTimeMinutes: number; maxAdvanceDays: number | null },
  query: { actor?: "customer" | "staff"; now?: Date },
): { earliestStart: Date; latestStart: Date | null } {
  const now = query.now ?? new Date();
  if ((query.actor ?? "customer") === "staff") return { earliestStart: new Date(0), latestStart: null };

  return {
    earliestStart: new Date(now.getTime() + Math.max(0, policy.minLeadTimeMinutes) * 60_000),
    latestStart: policy.maxAdvanceDays === null ? null : new Date(now.getTime() + policy.maxAdvanceDays * 24 * 60 * 60_000),
  };
}

function isWithinSchedule(
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
  rules: ReadonlyArray<{ dayOfWeek: number; startsAt: string; endsAt: string }>,
): boolean {
  const startParts = getLocalTimeParts(startsAt, timeZone);
  const endParts = getLocalTimeParts(endsAt, timeZone);

  if (startParts.weekday !== endParts.weekday) {
    return false;
  }

  const matchingRules = rules.filter((rule) => rule.dayOfWeek === startParts.weekday);

  return matchingRules.some((rule) => {
    const ruleStartsAt = toMinutes(rule.startsAt);
    const ruleEndsAt = toMinutes(rule.endsAt);

    return startParts.minutes >= ruleStartsAt && endParts.minutes <= ruleEndsAt;
  });
}

function getLocalTimeParts(value: Date, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = WEEKDAY_BY_NAME[values.weekday];

  if (weekday === undefined || !values.hour || !values.minute) {
    throw new Error("Unable to resolve branch local time");
  }

  return {
    weekday,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Schedule time must use HH:MM format");
  }

  return hours * 60 + minutes;
}
