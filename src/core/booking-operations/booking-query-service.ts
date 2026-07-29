import type { BookingStatus, Prisma } from "@/generated/prisma/client";

import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import type { BookingFilters } from "@/core/booking-operations/booking-operation-schemas";
import { prisma } from "@/core/database/prisma";
import { localDateTimeToUtc } from "@/core/formatting/dushanbe-date";

type ActorInput = { businessId: string; actorUserId: string };

export async function listBusinessBookings(input: ActorInput & { filters: BookingFilters }) {
  const actor = await bookingActor(input);
  const timeZone = await resolveTimeZone(input.businessId, input.filters.branchId);
  const where = bookingWhere(input, actor.staffId, timeZone);
  const rows = await prisma.booking.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true, timeZone: true } },
      customer: { select: { id: true, name: true, phone: true } },
      service: { select: { id: true, name: true, durationMinutes: true, amountDiram: true } },
      staff: { select: { id: true, displayName: true } },
      payment: { select: { id: true, status: true, amountDiram: true, isBankVerified: true } },
      resources: { include: { resource: { select: { id: true, name: true } } } },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: input.filters.limit + 1,
    ...(input.filters.cursor ? { cursor: { id: input.filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > input.filters.limit;
  const items = hasMore ? rows.slice(0, input.filters.limit) : rows;
  const counts = await prisma.booking.groupBy({ by: ["status"], where: { ...where, status: undefined }, _count: { _all: true } });
  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    counts: Object.fromEntries(counts.map((item) => [item.status, item._count._all])) as Partial<Record<BookingStatus, number>>,
    timeZone,
  };
}

export async function getBusinessBooking(input: ActorInput & { bookingId: string }) {
  const actor = await bookingActor(input);
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, businessId: input.businessId, ...(actor.staffId !== undefined ? { staffId: actor.staffId ?? "__none__" } : {}) },
    include: {
      branch: true,
      customer: true,
      service: true,
      staff: true,
      payment: true,
      resources: { include: { resource: true } },
      auditEvents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!booking) throw new BookingOperationError("NOT_FOUND");
  return booking;
}

async function bookingActor(input: ActorInput) {
  const membership = await prisma.membership.findUnique({
    where: { businessId_userId: { businessId: input.businessId, userId: input.actorUserId } },
    select: { id: true, role: true, staff: { select: { id: true } } },
  });
  if (!membership) throw new BookingOperationError("FORBIDDEN");
  return { membershipId: membership.id, role: membership.role, staffId: membership.role === "STAFF" ? membership.staff?.id ?? null : undefined };
}

async function resolveTimeZone(businessId: string, branchId?: string) {
  const branch = await prisma.branch.findFirst({ where: { businessId, archivedAt: null, ...(branchId ? { id: branchId } : {}) }, select: { timeZone: true }, orderBy: { createdAt: "asc" } });
  if (!branch) throw new BookingOperationError("NOT_FOUND");
  return branch.timeZone;
}

function bookingWhere(input: ActorInput & { filters: BookingFilters }, staffScope: string | null | undefined, timeZone: string): Prisma.BookingWhereInput {
  const { filters } = input;
  const where: Prisma.BookingWhereInput = {
    businessId: input.businessId,
    ...(filters.branchId ? { branchId: filters.branchId, branch: { businessId: input.businessId } } : {}),
    ...(filters.staffId ? { staffId: filters.staffId, staff: { businessId: input.businessId } } : {}),
    ...(staffScope !== undefined ? { staffId: staffScope ?? "__none__" } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  if (filters.view === "day") {
    where.startsAt = { gte: localDateTimeToUtc(filters.date, "00:00", timeZone), lt: localDateTimeToUtc(nextDate(filters.date), "00:00", timeZone) };
  }
  if (filters.search) {
    where.OR = [
      { customer: { name: { contains: filters.search, mode: "insensitive" } } },
      { customer: { phone: { contains: filters.search } } },
      { service: { name: { contains: filters.search, mode: "insensitive" } } },
    ];
  }
  return where;
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
