import { getAvailableStarts } from "@/core/availability/availability-service";
import { prisma } from "@/core/database/prisma";
import { localDateTimeToUtc } from "@/core/formatting/dushanbe-date";

/**
 * Booking without naming a specialist.
 *
 * A customer who has no opinion on who cuts their hair was made to pick one anyway, and the pick
 * immediately narrowed the times on offer to that one person's gaps. Here the question is deferred:
 * the times shown are everyone's, and a specialist is chosen only once a time has been.
 *
 * Nothing about a booking changes — it still names a specialist, and the assignment happens before
 * the booking is created rather than inside it, so there is no such thing as a booking belonging to
 * "anyone".
 */

/** The specialists a branch offers this service through, in a stable order. */
export async function listServiceStaffIds(branchId: string, serviceId: string): Promise<string[]> {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, branchId, archivedAt: null, isPublished: true },
    select: {
      staffMembers: {
        where: { archivedAt: null, branches: { some: { branchId } } },
        orderBy: { displayName: "asc" },
        select: { id: true },
      },
    },
  });
  return service?.staffMembers.map((staff) => staff.id) ?? [];
}

/**
 * Every time at least one of `staffIds` can take, with duplicates collapsed. Asked per specialist
 * because availability is per specialist — schedules, breaks and existing visits differ — and merged
 * afterwards.
 */
export async function getAvailableStartsForService(query: {
  branchId: string;
  serviceId: string;
  staffIds: string[];
  from: string;
  days: number;
  now?: Date;
}): Promise<Date[]> {
  const service = await prisma.service.findFirst({
    where: { id: query.serviceId, branchId: query.branchId, archivedAt: null, isPublished: true },
    select: { durationMinutes: true, branch: { select: { timeZone: true } }, resources: { select: { resourceId: true } } },
  });
  if (!service || query.staffIds.length === 0) return [];

  const timeZone = service.branch.timeZone;
  const rangeStartsAt = localDateTimeToUtc(query.from, "00:00", timeZone);
  const rangeEndsAt = localDateTimeToUtc(addDays(query.from, query.days), "00:00", timeZone);
  const resourceIds = service.resources.map(({ resourceId }) => resourceId);

  const perStaff = await Promise.all(query.staffIds.map((staffId) => getAvailableStarts({
    branchId: query.branchId,
    serviceId: query.serviceId,
    staffId,
    resourceIds,
    rangeStartsAt,
    rangeEndsAt,
    durationMinutes: service.durationMinutes,
    intervalMinutes: 30,
    actor: "customer",
    now: query.now,
  })));

  const merged = new Map<number, Date>();
  for (const starts of perStaff) {
    for (const start of starts) merged.set(start.getTime(), start);
  }
  return [...merged.values()].sort((left, right) => left.getTime() - right.getTime());
}

/**
 * Who takes this time. Only specialists genuinely free at it are considered — a resource the service
 * needs may be busy even when a person is not — and among them the one with the lightest day, so a
 * salon does not fill its first specialist while the second stands idle.
 *
 * Null means nobody can take it, which is an answer to give the customer rather than a specialist to
 * invent: assigning a busy one would produce a double booking the calendar would have to sort out.
 */
export async function resolveStaffForStart(query: {
  branchId: string;
  serviceId: string;
  startsAt: Date;
  now?: Date;
}): Promise<string | null> {
  const service = await prisma.service.findFirst({
    where: { id: query.serviceId, branchId: query.branchId, archivedAt: null, isPublished: true },
    select: { durationMinutes: true, resources: { select: { resourceId: true } } },
  });
  if (!service) return null;

  const staffIds = await listServiceStaffIds(query.branchId, query.serviceId);
  const resourceIds = service.resources.map(({ resourceId }) => resourceId);
  const endsAt = new Date(query.startsAt.getTime() + service.durationMinutes * 60_000);

  const free: string[] = [];
  for (const staffId of staffIds) {
    const starts = await getAvailableStarts({
      branchId: query.branchId,
      serviceId: query.serviceId,
      staffId,
      resourceIds,
      rangeStartsAt: query.startsAt,
      rangeEndsAt: endsAt,
      durationMinutes: service.durationMinutes,
      intervalMinutes: service.durationMinutes,
      actor: "customer",
      now: query.now,
    });
    if (starts.length === 1) free.push(staffId);
  }
  if (free.length === 0) return null;
  if (free.length === 1) return free[0];

  const dayStartsAt = new Date(Date.UTC(query.startsAt.getUTCFullYear(), query.startsAt.getUTCMonth(), query.startsAt.getUTCDate()));
  const load = await prisma.booking.groupBy({
    by: ["staffId"],
    where: {
      staffId: { in: free },
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      startsAt: { gte: dayStartsAt, lt: new Date(dayStartsAt.getTime() + 86_400_000) },
    },
    _count: { _all: true },
  });
  const bookedByStaff = new Map(load.map((row) => [row.staffId, row._count._all]));
  // Ties keep the order specialists are listed in, so the choice is at least predictable.
  return free.reduce((lightest, staffId) =>
    (bookedByStaff.get(staffId) ?? 0) < (bookedByStaff.get(lightest) ?? 0) ? staffId : lightest);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
