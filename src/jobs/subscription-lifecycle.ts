import { prisma } from "@/core/database/prisma";
import { scheduleBusinessNotificationSafely, type BusinessNotificationKind } from "@/core/notifications/business-notification-service";
import { nextSubscriptionStatus, type SubscriptionState } from "@/core/platform/subscription-lifecycle";
import type { SubscriptionStatus } from "@/generated/prisma/client";

/** How long before the period ends the business is told that it ends. */
export const ENDING_WARNING_DAYS = 3;

const DAY_MS = 86_400_000;

const TRANSITION_NOTIFICATION: Record<SubscriptionStatus, BusinessNotificationKind | null> = {
  TRIALING: null,
  ACTIVE: null,
  GRACE: "SUBSCRIPTION_GRACE",
  EXPIRED: "SUBSCRIPTION_EXPIRED",
};

type Subscription = SubscriptionState & { id: string };

/**
 * Walks subscriptions past their paid period into grace and then into expiry, and warns the business
 * before each step. `scope` narrows the sweep to one business: production leaves it unset, tests set
 * it because the suite shares a database and an unscoped sweep would move rows another file is
 * asserting on.
 *
 * Returns how many businesses this run actually changed or warned, so a quiet sweep — the normal
 * case — logs at debug instead of drowning the useful lines.
 */
export async function runSubscriptionLifecycle(now = new Date(), scope?: { businessId: string }): Promise<number> {
  const subscriptions = await prisma.business.findMany({
    where: {
      ...(scope ? { id: scope.businessId } : {}),
      // A null end date is the grant that never expires — every business from before billing, and
      // every manual grant since. Excluding it here is what keeps that promise.
      subscriptionEndsAt: { not: null },
      subscriptionStatus: { in: ["TRIALING", "ACTIVE", "GRACE"] },
    },
    select: { id: true, subscriptionPlan: true, subscriptionStatus: true, subscriptionEndsAt: true },
  });

  let processed = 0;
  for (const subscription of subscriptions) {
    if (await advance(subscription, now)) processed += 1;
  }
  return processed;
}

async function advance(subscription: Subscription, now: Date): Promise<boolean> {
  const endsAt = subscription.subscriptionEndsAt!;
  const nextStatus = nextSubscriptionStatus(subscription, now);

  if (!nextStatus) {
    if (now.getTime() < endsAt.getTime() - ENDING_WARNING_DAYS * DAY_MS) return false;
    if (subscription.subscriptionStatus === "GRACE") return false;
    return warnOnce(subscription.id, "SUBSCRIPTION_ENDING", key(subscription.id, "ending", endsAt), now);
  }

  // Conditioned on the status this run read, so two schedulers cannot both count the same
  // transition — the loser updates nothing and reports no work.
  const moved = await prisma.business.updateMany({
    where: { id: subscription.id, subscriptionStatus: subscription.subscriptionStatus },
    data: { subscriptionStatus: nextStatus },
  });
  if (moved.count === 0) return false;

  const kind = TRANSITION_NOTIFICATION[nextStatus];
  if (kind) await warnOnce(subscription.id, kind, key(subscription.id, nextStatus.toLowerCase(), endsAt), now);
  return true;
}

/**
 * Queues a warning unless this business already has one under the same key. The key carries the
 * period it is about, so a restart in the same minute stays silent while a business that paid — and
 * so has a new period end — is warned about the new period when its turn comes.
 */
async function warnOnce(businessId: string, kind: BusinessNotificationKind, deduplicationKey: string, now: Date): Promise<boolean> {
  const existing = await prisma.businessNotification.findUnique({
    where: { businessId_deduplicationKey: { businessId, deduplicationKey } },
    select: { id: true },
  });
  if (existing) return false;
  await scheduleBusinessNotificationSafely({ businessId, kind, deduplicationKey, scheduledAt: now });
  return true;
}

function key(businessId: string, event: string, endsAt: Date): string {
  return `subscription:${businessId}:${event}:${endsAt.toISOString()}`;
}
