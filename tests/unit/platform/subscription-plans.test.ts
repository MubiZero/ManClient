import { describe, expect, it } from "vitest";

import type { PlanFeature } from "@/core/platform/subscription-plans";
import { PAID_FEATURES, businessHasFeature, featuresForPlan, requirePlanFeature } from "@/core/platform/subscription-plans";

const endsAt = new Date("2026-03-01T09:00:00.000Z");
const premium = { subscriptionPlan: "PREMIUM", subscriptionEndsAt: endsAt } as const;

describe("feature entitlement", () => {
  it("gives a trialing business the whole product", () => {
    for (const feature of PAID_FEATURES) {
      expect(businessHasFeature({ ...premium, subscriptionStatus: "TRIALING" }, feature)).toBe(true);
    }
  });

  it("keeps every paid feature switched on during grace", () => {
    // Grace warns the business; it does not start degrading the product it already paid for.
    for (const feature of PAID_FEATURES) {
      expect(businessHasFeature({ ...premium, subscriptionStatus: "GRACE" }, feature)).toBe(true);
    }
  });

  it("takes every paid feature away once the subscription has expired", () => {
    for (const feature of PAID_FEATURES) {
      expect(businessHasFeature({ ...premium, subscriptionStatus: "EXPIRED" }, feature)).toBe(false);
    }
  });

  it("still refuses a feature the business never bought", () => {
    const standard = { subscriptionPlan: "STANDARD", subscriptionStatus: "ACTIVE", subscriptionEndsAt: endsAt } as const;
    expect(businessHasFeature(standard, "PROMO_CODES")).toBe(true);
    expect(businessHasFeature(standard, "STAFF_COMMISSIONS")).toBe(false);
  });

  it("leaves a business without an end date entitled forever", () => {
    const granted = { subscriptionPlan: "PREMIUM", subscriptionStatus: "ACTIVE", subscriptionEndsAt: null } as const;
    expect(businessHasFeature(granted, "REVIEWS")).toBe(true);
  });
});

describe("requirePlanFeature", () => {
  it("throws for an expired business and names the feature it refused", () => {
    const expired = { ...premium, subscriptionStatus: "EXPIRED" } as const;
    expect(() => requirePlanFeature(expired, "WAITLIST")).toThrowError(/PLAN_REQUIRED/);
  });

  it("stays silent while the subscription is in force", () => {
    expect(() => requirePlanFeature({ ...premium, subscriptionStatus: "ACTIVE" }, "WAITLIST")).not.toThrow();
  });
});

describe("featuresForPlan", () => {
  it("reports what a plan is worth without asking about a subscription", () => {
    // The pricing page describes plans, not the reader's own subscription.
    expect(featuresForPlan("START")).toEqual([]);
    expect(featuresForPlan("PREMIUM")).toEqual([...PAID_FEATURES] satisfies PlanFeature[]);
  });
});
