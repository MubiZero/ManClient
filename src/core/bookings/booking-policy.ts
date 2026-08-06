import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

/**
 * The rules a business sets once and the product then enforces, instead of the free-text
 * `cancellationPolicy` paragraph that only ever informed the customer and bound nobody. Everything
 * here applies to the *customer*: a business rearranging its own day is never blocked by its own
 * cancellation window, because the day belongs to it.
 */

export type BookingPolicyCode =
  | "CANCELLATION_WINDOW_CLOSED"
  | "RESCHEDULE_WINDOW_CLOSED"
  | "RESCHEDULE_LIMIT_REACHED";

export class BookingPolicyError extends Error {
  constructor(
    public readonly code: BookingPolicyCode,
    /** What the business configured, so the message can say "не позднее чем за 4 часа" rather than "нельзя". */
    public readonly limit?: number,
  ) {
    super(code);
    this.name = "BookingPolicyError";
  }
}

export type CustomerBookingPolicy = {
  minLeadTimeMinutes: number;
  maxAdvanceDays: number | null;
  freeCancellationHours: number;
  maxCustomerReschedules: number | null;
};

type PolicyDatabase = Pick<Prisma.TransactionClient, "business">;

export async function getCustomerBookingPolicy(businessId: string, database: PolicyDatabase = prisma): Promise<CustomerBookingPolicy> {
  return database.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { minLeadTimeMinutes: true, maxAdvanceDays: true, freeCancellationHours: true, maxCustomerReschedules: true },
  });
}

/**
 * Whether the customer is still inside the window in which they may change their own booking. A zero
 * window means "always", which is how every business behaved before these fields existed — so an
 * untouched business keeps its old behaviour exactly.
 */
export function isWithinChangeWindow(policy: Pick<CustomerBookingPolicy, "freeCancellationHours">, startsAt: Date, now: Date): boolean {
  if (policy.freeCancellationHours <= 0) return true;
  return startsAt.getTime() - now.getTime() >= policy.freeCancellationHours * 60 * 60_000;
}

export function assertCustomerMayCancel(policy: CustomerBookingPolicy, startsAt: Date, now: Date): void {
  if (!isWithinChangeWindow(policy, startsAt, now)) {
    throw new BookingPolicyError("CANCELLATION_WINDOW_CLOSED", policy.freeCancellationHours);
  }
}

export function assertCustomerMayReschedule(
  policy: CustomerBookingPolicy,
  booking: { startsAt: Date; rescheduleCount: number },
  now: Date,
): void {
  if (!isWithinChangeWindow(policy, booking.startsAt, now)) {
    throw new BookingPolicyError("RESCHEDULE_WINDOW_CLOSED", policy.freeCancellationHours);
  }
  if (policy.maxCustomerReschedules !== null && booking.rescheduleCount >= policy.maxCustomerReschedules) {
    throw new BookingPolicyError("RESCHEDULE_LIMIT_REACHED", policy.maxCustomerReschedules);
  }
}
