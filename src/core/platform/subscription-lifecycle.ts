import type { BillingPeriod, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma/client";

/** How long a new business sees the whole product before it has to decide. */
export const TRIAL_DAYS = 14;

/**
 * How long a lapsed subscription keeps every paid feature. Grace is a warning, not a punishment: a
 * business that forgot to transfer on a Friday should not discover on Saturday that its SMS stopped.
 */
export const GRACE_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * The three fields that together answer "what is this business entitled to right now". Callers take
 * the whole shape rather than a bare plan so that a subscription which has run out cannot be read as
 * if it were still paid — see `businessHasFeature`.
 */
export type SubscriptionState = {
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: Date | null;
};

/**
 * What the business may actually use. Only `EXPIRED` takes anything away; grace deliberately does
 * not, and a null end date never expires at all — that is every business from before billing, and
 * every manual grant since.
 */
export function effectivePlan(subscription: SubscriptionState): SubscriptionPlan {
  return subscription.subscriptionStatus === "EXPIRED" ? "START" : subscription.subscriptionPlan;
}

/**
 * The status this subscription should move to, or `null` when it should be left alone. Returning
 * null rather than the current status keeps the caller honest: the lifecycle job writes a row only
 * when there is a real transition, so re-running it in the same minute is free and silent.
 */
export function nextSubscriptionStatus(subscription: SubscriptionState, now: Date): SubscriptionStatus | null {
  const endsAt = subscription.subscriptionEndsAt;
  if (!endsAt) return null;

  switch (subscription.subscriptionStatus) {
    case "TRIALING":
    case "ACTIVE":
      return now.getTime() > endsAt.getTime() ? "GRACE" : null;
    case "GRACE":
      return now.getTime() > endsAt.getTime() + GRACE_DAYS * DAY_MS ? "EXPIRED" : null;
    case "EXPIRED":
      return null;
  }
}

/**
 * Where the paid period ends once `period` is added to it. Extension starts from whichever is later,
 * the unfinished period or today, so paying a week early adds a week of value instead of throwing it
 * away — and a subscription that lapsed months ago does not buy back the silent months.
 */
export function extendPeriod(currentEndsAt: Date | null, period: BillingPeriod, now: Date): Date {
  const base = currentEndsAt && currentEndsAt.getTime() > now.getTime() ? currentEndsAt : now;
  return period === "YEARLY" ? addMonths(base, 12) : addMonths(base, 1);
}

/** The subscription fields a newly registered business starts with. */
export function startTrial(now: Date): SubscriptionState {
  return {
    subscriptionPlan: "PREMIUM",
    subscriptionStatus: "TRIALING",
    subscriptionEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
  };
}

/**
 * Calendar-month arithmetic, clamped to the last day of the target month. Letting `setUTCMonth`
 * overflow would turn 31 January into 3 March and hand the business two free days every time.
 */
function addMonths(from: Date, months: number): Date {
  const target = new Date(from.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return target;
}
