import { BookingStatus, type Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

/**
 * A booking occupies more of a specialist's day than the visit itself: a box needs the previous car
 * out of it, a chair needs cleaning, a room needs airing. Those minutes live on the service as
 * `bufferBeforeMinutes` / `bufferAfterMinutes`, and everything that decides whether two bookings can
 * coexist has to compare *buffered* windows — the availability sweep, the reservation transaction and
 * the reschedule transaction alike. This module is the one place that knows how.
 */

export const ACTIVE_BOOKING_STATUSES = [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED];

/**
 * Buffers are capped so that a range query can be widened by a known amount: the database cannot join
 * each booking to its service's buffers before filtering, so candidates are fetched with this much
 * slack and the exact comparison happens in memory. The settings schema enforces the same ceiling.
 */
export const MAX_BUFFER_MINUTES = 240;

export type ServiceBuffers = { bufferBeforeMinutes: number; bufferAfterMinutes: number };

export type BlockedWindow = { from: Date; to: Date };

export const NO_BUFFERS: ServiceBuffers = { bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };

export function blockedWindow(startsAt: Date, endsAt: Date, buffers: ServiceBuffers): BlockedWindow {
  return {
    from: new Date(startsAt.getTime() - clampBuffer(buffers.bufferBeforeMinutes) * 60_000),
    to: new Date(endsAt.getTime() + clampBuffer(buffers.bufferAfterMinutes) * 60_000),
  };
}

/** Touching windows do not overlap: a visit may start the minute another one's buffer ends. */
export function windowsOverlap(first: BlockedWindow, second: BlockedWindow): boolean {
  return first.from < second.to && first.to > second.from;
}

type WindowDatabase = Pick<Prisma.TransactionClient, "booking">;

type OccupancyQuery = {
  branchId: string;
  staffId: string;
  resourceIds: string[];
  /** Widened internally by MAX_BUFFER_MINUTES, so callers pass the plain range they care about. */
  rangeStartsAt: Date;
  rangeEndsAt: Date;
  excludeBookingId?: string;
};

export type OccupiedSlot = BlockedWindow & { bookingId: string; resourceIds: string[] };

/**
 * Every window already taken on this specialist or on these resources within the range. Fetched once
 * per availability sweep rather than once per candidate slot — the old per-slot query issued one round
 * trip per half hour of the working day.
 */
export async function listOccupiedWindows(
  query: OccupancyQuery,
  database: WindowDatabase = prisma,
): Promise<OccupiedSlot[]> {
  const slack = MAX_BUFFER_MINUTES * 60_000;
  const bookings = await database.booking.findMany({
    where: {
      id: query.excludeBookingId ? { not: query.excludeBookingId } : undefined,
      branchId: query.branchId,
      status: { in: ACTIVE_BOOKING_STATUSES },
      startsAt: { lt: new Date(query.rangeEndsAt.getTime() + slack) },
      endsAt: { gt: new Date(query.rangeStartsAt.getTime() - slack) },
      OR: [
        { staffId: query.staffId },
        ...(query.resourceIds.length > 0 ? [{ resources: { some: { resourceId: { in: query.resourceIds } } } }] : []),
      ],
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      resources: { select: { resourceId: true } },
      service: { select: { bufferBeforeMinutes: true, bufferAfterMinutes: true } },
    },
  });

  return bookings.map((booking) => ({
    bookingId: booking.id,
    resourceIds: booking.resources.map(({ resourceId }) => resourceId),
    ...blockedWindow(booking.startsAt, booking.endsAt, booking.service),
  }));
}

/**
 * The one blocking booking, if any, for a visit that would occupy `window`. Used inside the
 * reservation and reschedule transactions, where a single answer under serializable isolation is what
 * matters rather than a whole day's occupancy.
 */
export async function findBlockingBooking(
  query: OccupancyQuery & { startsAt: Date; endsAt: Date; buffers: ServiceBuffers },
  database: WindowDatabase = prisma,
): Promise<OccupiedSlot | null> {
  const candidateWindow = blockedWindow(query.startsAt, query.endsAt, query.buffers);
  const occupied = await listOccupiedWindows(query, database);
  return occupied.find((slot) => windowsOverlap(candidateWindow, slot)) ?? null;
}

function clampBuffer(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(Math.trunc(minutes), MAX_BUFFER_MINUTES);
}
