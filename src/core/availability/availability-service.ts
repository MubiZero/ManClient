import { BookingStatus } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

type AvailabilityQuery = {
  branchId: string;
  staffId: string;
  resourceIds: string[];
  rangeStartsAt: Date;
  rangeEndsAt: Date;
  durationMinutes: number;
  intervalMinutes: number;
  excludeBookingId?: string;
};

const ACTIVE_BOOKING_STATUSES = [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED];
const WEEKDAY_BY_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export async function getAvailableStarts(query: AvailabilityQuery): Promise<Date[]> {
  if (!Number.isInteger(query.durationMinutes) || query.durationMinutes <= 0) {
    throw new Error("Duration must be a positive integer");
  }

  if (!Number.isInteger(query.intervalMinutes) || query.intervalMinutes <= 0) {
    throw new Error("Interval must be a positive integer");
  }

  const branch = await prisma.branch.findUnique({
    where: { id: query.branchId },
    include: { scheduleRules: true },
  });

  if (!branch) {
    throw new Error("Branch does not exist");
  }

  const availableStarts: Date[] = [];
  const lastStartTime = query.rangeEndsAt.getTime() - query.durationMinutes * 60_000;

  for (
    let candidateTime = query.rangeStartsAt.getTime();
    candidateTime <= lastStartTime;
    candidateTime += query.intervalMinutes * 60_000
  ) {
    const startsAt = new Date(candidateTime);
    const endsAt = new Date(candidateTime + query.durationMinutes * 60_000);

    if (!isWithinSchedule(startsAt, endsAt, branch.timeZone, branch.scheduleRules)) {
      continue;
    }

    const hasConflict = await prisma.booking.findFirst({
      where: {
        id: query.excludeBookingId ? { not: query.excludeBookingId } : undefined,
        branchId: query.branchId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [
          { staffId: query.staffId },
          ...(query.resourceIds.length > 0
            ? [{ resources: { some: { resourceId: { in: query.resourceIds } } } }]
            : []),
        ],
      },
      select: { id: true },
    });

    if (!hasConflict) {
      availableStarts.push(startsAt);
    }
  }

  return availableStarts;
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
