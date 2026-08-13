import type { BookingStatus } from "@/generated/prisma/client";
import { assertCustomerMayCancel, isWithinChangeWindow } from "@/core/bookings/booking-policy";
import { cancelBooking } from "@/core/bookings/cancel-booking";
import { prisma } from "@/core/database/prisma";
import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";

/**
 * Everything one phone number has booked, across every salon on the platform.
 *
 * A customer of this product does not belong to a salon; they belong to a number. Somebody who books
 * a haircut in one place and a manicure in another has two `Customer` rows and one life, and this is
 * the query that puts the second back together. It is deliberately keyed on the phone rather than on
 * a customer id: the id would silently answer for one salon only, which is the kind of bug that looks
 * like an empty list rather than like an error.
 */

export type CustomerVisit = {
  id: string;
  businessName: string;
  businessSlug: string;
  branchName: string;
  timeZone: string;
  serviceName: string;
  staffName: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  /** Whether the salon's own window still lets the customer move or drop this one themselves. */
  canCancel: boolean;
  canReschedule: boolean;
};

/** How far back the past goes. A customer looking for last year's visit is looking for a receipt, not a list. */
const PAST_LIMIT = 20;

const visitSelection = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  rescheduleCount: true,
  branch: { select: { name: true, timeZone: true } },
  service: { select: { name: true } },
  staff: { select: { displayName: true } },
  business: { select: { name: true, slug: true, freeCancellationHours: true, maxCustomerReschedules: true } },
} as const;

export async function listVisitsForPhone(
  phone: string,
  now = new Date(),
): Promise<{ upcoming: CustomerVisit[]; past: CustomerVisit[] }> {
  const normalized = normalizeTajikPhone(phone);
  if (!normalized) return { upcoming: [], past: [] };

  const [upcoming, past] = await Promise.all([
    prisma.booking.findMany({
      // Held-but-unpaid visits are shown too: that is exactly the state a customer needs to see, and
      // hiding it is how somebody ends up transferring money for a booking that already lapsed.
      where: { customer: { phone: normalized }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] }, endsAt: { gte: now } },
      select: visitSelection,
      orderBy: { startsAt: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        customer: { phone: normalized },
        OR: [{ endsAt: { lt: now } }, { status: { in: ["CANCELLED", "EXPIRED", "NO_SHOW"] } }],
      },
      select: visitSelection,
      orderBy: { startsAt: "desc" },
      take: PAST_LIMIT,
    }),
  ]);

  return {
    upcoming: upcoming.map((booking) => toVisit(booking, now)),
    // A cancelled visit still in the future satisfies both queries; the upcoming list has already
    // filtered it out by status, so only the past list needs to be told about it once.
    past: past.map((booking) => ({ ...toVisit(booking, now), canCancel: false, canReschedule: false })),
  };
}

type VisitRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  rescheduleCount: number;
  branch: { name: string; timeZone: string };
  service: { name: string };
  staff: { displayName: string };
  business: { name: string; slug: string; freeCancellationHours: number; maxCustomerReschedules: number | null };
};

function toVisit(booking: VisitRow, now: Date): CustomerVisit {
  const withinWindow = isWithinChangeWindow(booking.business, booking.startsAt, now);
  const rescheduleLeft =
    booking.business.maxCustomerReschedules === null || booking.rescheduleCount < booking.business.maxCustomerReschedules;
  return {
    id: booking.id,
    businessName: booking.business.name,
    businessSlug: booking.business.slug,
    branchName: booking.branch.name,
    timeZone: booking.branch.timeZone,
    serviceName: booking.service.name,
    staffName: booking.staff.displayName,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    canCancel: withinWindow,
    canReschedule: withinWindow && rescheduleLeft,
  };
}

/**
 * The name this number last gave a salon. Taken from the most recently touched row rather than from
 * any particular salon's: a customer who corrected their name somewhere expects the correction to
 * follow them, and no salon owns the spelling of a person's name.
 */
export async function findCustomerName(phone: string): Promise<string | null> {
  const normalized = normalizeTajikPhone(phone);
  if (!normalized) return null;
  const customer = await prisma.customer.findFirst({
    where: { phone: normalized },
    orderBy: { updatedAt: "desc" },
    select: { name: true },
  });
  return customer?.name ?? null;
}

/**
 * Cancels on the customer's own behalf. The phone is the authorisation: the booking is found through
 * the customer row that carries it, so a signed-in customer can only ever reach their own visits, and
 * the salon's cancellation window still applies exactly as it does everywhere else.
 */
export async function cancelVisitForPhone(input: { phone: string; bookingId: string }, now = new Date()): Promise<void> {
  const phone = normalizeTajikPhone(input.phone);
  if (!phone) throw new CustomerVisitError("NOT_FOUND");

  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, customer: { phone }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
    select: { customerId: true, businessId: true, startsAt: true },
  });
  if (!booking) throw new CustomerVisitError("NOT_FOUND");

  assertCustomerMayCancel(
    await prisma.business.findUniqueOrThrow({
      where: { id: booking.businessId },
      select: { minLeadTimeMinutes: true, maxAdvanceDays: true, freeCancellationHours: true, maxCustomerReschedules: true },
    }),
    booking.startsAt,
    now,
  );
  await cancelBooking({ bookingId: input.bookingId, actor: { type: "customer", customerId: booking.customerId } }, now);
}

export class CustomerVisitError extends Error {
  constructor(public readonly code: "NOT_FOUND") {
    super(code);
    this.name = "CustomerVisitError";
  }
}
