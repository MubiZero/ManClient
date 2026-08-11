import type { SubscriptionPlan } from "@/generated/prisma/client";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { effectivePlan, type SubscriptionState } from "@/core/platform/subscription-lifecycle";

export { PLAN_DESCRIPTIONS, PLAN_LABELS } from "@/core/platform/plan-labels";

export type PlanFeature = "SMS" | "WAITLIST" | "PROMO_CODES" | "RECURRING_BOOKINGS" | "STAFF_COMMISSIONS" | "REVIEWS";

/** Everything that costs money, in the order a business meets it going up the plans. */
export const PAID_FEATURES = ["SMS", "WAITLIST", "PROMO_CODES", "RECURRING_BOOKINGS", "STAFF_COMMISSIONS", "REVIEWS"] as const satisfies readonly PlanFeature[];

/**
 * The three subscription fields every gate needs. Selecting them together in a Prisma query is the
 * point: a call site that reads only `subscriptionPlan` cannot compile, so an expired business
 * cannot keep a paid feature just because someone forgot to check the status here.
 */
export const SUBSCRIPTION_SELECT = { subscriptionPlan: true, subscriptionStatus: true, subscriptionEndsAt: true } as const;

const PLAN_FEATURES: Record<SubscriptionPlan, ReadonlySet<PlanFeature>> = {
  START: new Set(),
  STANDARD: new Set(["SMS", "WAITLIST", "PROMO_CODES"]),
  PREMIUM: new Set(["SMS", "WAITLIST", "PROMO_CODES", "RECURRING_BOOKINGS", "STAFF_COMMISSIONS", "REVIEWS"]),
};

/**
 * Whether the business may use `feature` right now. Takes the subscription rather than the plan
 * because the plan alone says only what was sold, not whether it is still in force.
 */
export function businessHasFeature(subscription: SubscriptionState, feature: PlanFeature): boolean {
  return PLAN_FEATURES[effectivePlan(subscription)].has(feature);
}

export function requirePlanFeature(subscription: SubscriptionState, feature: PlanFeature): void {
  if (!businessHasFeature(subscription, feature)) throw new SettingsError("PLAN_REQUIRED", { feature });
}

/** What a plan is worth, independent of anyone's subscription — this describes the offer itself. */
export function featuresForPlan(plan: SubscriptionPlan): PlanFeature[] {
  return [...PLAN_FEATURES[plan]];
}

export async function getBusinessPlanSummary(businessId: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: SUBSCRIPTION_SELECT });
  return {
    plan: business.subscriptionPlan,
    status: business.subscriptionStatus,
    endsAt: business.subscriptionEndsAt,
    effectivePlan: effectivePlan(business),
    features: featuresForPlan(effectivePlan(business)),
  };
}
