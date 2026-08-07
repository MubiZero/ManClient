import { describe, expect, it } from "vitest";

import { GRACE_DAYS, TRIAL_DAYS, effectivePlan, extendPeriod, nextSubscriptionStatus, startTrial } from "@/core/platform/subscription-lifecycle";

const march1 = new Date("2026-03-01T09:00:00.000Z");

describe("effective plan", () => {
  it("honours the sold plan while the subscription is trialing, active or in grace", () => {
    for (const subscriptionStatus of ["TRIALING", "ACTIVE", "GRACE"] as const) {
      expect(effectivePlan({ subscriptionPlan: "PREMIUM", subscriptionStatus, subscriptionEndsAt: march1 })).toBe("PREMIUM");
    }
  });

  it("falls back to START only once the subscription has expired", () => {
    expect(effectivePlan({ subscriptionPlan: "PREMIUM", subscriptionStatus: "EXPIRED", subscriptionEndsAt: march1 })).toBe("START");
  });

  it("keeps a business without an end date on its plan forever", () => {
    // Every business that existed before billing looks like this, and so does a manual grant.
    expect(effectivePlan({ subscriptionPlan: "STANDARD", subscriptionStatus: "ACTIVE", subscriptionEndsAt: null })).toBe("STANDARD");
  });
});

describe("status transitions", () => {
  const active = { subscriptionPlan: "PREMIUM", subscriptionStatus: "ACTIVE", subscriptionEndsAt: march1 } as const;

  it("leaves a paid subscription alone until its last day is over", () => {
    expect(nextSubscriptionStatus(active, new Date("2026-03-01T08:59:00.000Z"))).toBeNull();
  });

  it("moves a lapsed subscription into grace, not straight out of the product", () => {
    expect(nextSubscriptionStatus(active, new Date("2026-03-01T09:00:01.000Z"))).toBe("GRACE");
  });

  it("expires only after the whole grace window has passed", () => {
    const grace = { ...active, subscriptionStatus: "GRACE" } as const;
    const lastGraceMoment = new Date(march1.getTime() + GRACE_DAYS * 86_400_000 - 1000);
    expect(nextSubscriptionStatus(grace, lastGraceMoment)).toBeNull();
    expect(nextSubscriptionStatus(grace, new Date(lastGraceMoment.getTime() + 2000))).toBe("EXPIRED");
  });

  it("never touches a subscription that has no end date", () => {
    const forever = { subscriptionPlan: "PREMIUM", subscriptionStatus: "ACTIVE", subscriptionEndsAt: null } as const;
    expect(nextSubscriptionStatus(forever, new Date("2099-01-01T00:00:00.000Z"))).toBeNull();
  });

  it("reports nothing to do for a subscription that already expired", () => {
    const expired = { ...active, subscriptionStatus: "EXPIRED" } as const;
    expect(nextSubscriptionStatus(expired, new Date("2026-05-01T00:00:00.000Z"))).toBeNull();
  });

  it("lets a trial lapse into grace like any other period", () => {
    const trial = { ...active, subscriptionStatus: "TRIALING" } as const;
    expect(nextSubscriptionStatus(trial, new Date("2026-03-02T00:00:00.000Z"))).toBe("GRACE");
  });
});

describe("extending a paid period", () => {
  it("adds the period to the end of an unfinished one, so paying early loses nothing", () => {
    const paidThrough = new Date("2026-03-20T09:00:00.000Z");
    expect(extendPeriod(paidThrough, "MONTHLY", march1).toISOString()).toBe("2026-04-20T09:00:00.000Z");
  });

  it("adds the period to today when the previous one already lapsed", () => {
    const lapsed = new Date("2026-01-05T09:00:00.000Z");
    expect(extendPeriod(lapsed, "MONTHLY", march1).toISOString()).toBe("2026-04-01T09:00:00.000Z");
  });

  it("starts from today for a business that never had a period", () => {
    expect(extendPeriod(null, "YEARLY", march1).toISOString()).toBe("2027-03-01T09:00:00.000Z");
  });

  it("clamps a month that the next month is too short to hold", () => {
    // 31 January + one month has no 31 February; landing on 3 March would silently gift two days.
    expect(extendPeriod(new Date("2026-01-31T09:00:00.000Z"), "MONTHLY", new Date("2026-01-31T09:00:00.000Z")).toISOString()).toBe(
      "2026-02-28T09:00:00.000Z",
    );
  });
});

describe("trial", () => {
  it("gives a new business the full product for the trial window", () => {
    expect(startTrial(march1)).toEqual({
      subscriptionPlan: "PREMIUM",
      subscriptionStatus: "TRIALING",
      subscriptionEndsAt: new Date(march1.getTime() + TRIAL_DAYS * 86_400_000),
    });
  });
});
