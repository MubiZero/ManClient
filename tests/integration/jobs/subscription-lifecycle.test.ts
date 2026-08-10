import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import { GRACE_DAYS } from "@/core/platform/subscription-lifecycle";
import { runSubscriptionLifecycle } from "@/jobs/subscription-lifecycle";
import type { SubscriptionStatus } from "@/generated/prisma/client";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-09-01T09:00:00.000Z");

describe("runSubscriptionLifecycle", () => {
  // Every test scopes the job to the business it just created. The suite shares one database, and
  // an unscoped sweep would move subscriptions another file is mid-way through asserting on.

  it("moves a lapsed subscription to grace and warns the business once", async () => {
    const business = await createBusiness({ status: "ACTIVE", endsAt: new Date(NOW.getTime() - 60_000) });

    await expect(runSubscriptionLifecycle(NOW, { businessId: business.id })).resolves.toBe(1);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ subscriptionStatus: "GRACE" });
    expect(await notificationKinds(business.id)).toEqual(["SUBSCRIPTION_GRACE"]);

    // Re-running in the same minute is what a restarted scheduler does. It must not warn twice.
    await expect(runSubscriptionLifecycle(NOW, { businessId: business.id })).resolves.toBe(0);
    expect(await notificationKinds(business.id)).toEqual(["SUBSCRIPTION_GRACE"]);
  });

  it("expires a subscription only after the grace period has run out", async () => {
    const endsAt = new Date(NOW.getTime() - GRACE_DAYS * DAY_MS - 60_000);
    const business = await createBusiness({ status: "GRACE", endsAt });

    // The last moment of grace still counts as grace; expiry is the moment after it.
    await expect(runSubscriptionLifecycle(new Date(endsAt.getTime() + GRACE_DAYS * DAY_MS), { businessId: business.id })).resolves.toBe(0);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ subscriptionStatus: "GRACE" });

    await expect(runSubscriptionLifecycle(NOW, { businessId: business.id })).resolves.toBe(1);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ subscriptionStatus: "EXPIRED" });
    expect(await notificationKinds(business.id)).toEqual(["SUBSCRIPTION_EXPIRED"]);

    await expect(runSubscriptionLifecycle(NOW, { businessId: business.id })).resolves.toBe(0);
  });

  it("warns three days before the period ends without changing anything", async () => {
    const business = await createBusiness({ status: "TRIALING", endsAt: new Date(NOW.getTime() + 2 * DAY_MS) });

    await expect(runSubscriptionLifecycle(NOW, { businessId: business.id })).resolves.toBe(1);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({
      subscriptionStatus: "TRIALING",
      subscriptionPlan: "PREMIUM",
    });
    expect(await notificationKinds(business.id)).toEqual(["SUBSCRIPTION_ENDING"]);

    await expect(runSubscriptionLifecycle(NOW, { businessId: business.id })).resolves.toBe(0);
    expect(await notificationKinds(business.id)).toEqual(["SUBSCRIPTION_ENDING"]);
  });

  it("stays quiet while the period still has more than three days to run", async () => {
    const business = await createBusiness({ status: "ACTIVE", endsAt: new Date(NOW.getTime() + 10 * DAY_MS) });

    await expect(runSubscriptionLifecycle(NOW, { businessId: business.id })).resolves.toBe(0);
    expect(await notificationKinds(business.id)).toEqual([]);
  });

  it("never touches a subscription without an end date", async () => {
    const business = await createBusiness({ status: "ACTIVE", endsAt: null });

    await expect(runSubscriptionLifecycle(new Date("2099-01-01T00:00:00.000Z"), { businessId: business.id })).resolves.toBe(0);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ subscriptionStatus: "ACTIVE" });
    expect(await notificationKinds(business.id)).toEqual([]);
  });

  it("warns again about the next period rather than staying silent after a payment", async () => {
    const business = await createBusiness({ status: "ACTIVE", endsAt: new Date(NOW.getTime() + 2 * DAY_MS) });
    await runSubscriptionLifecycle(NOW, { businessId: business.id });

    const extended = new Date(NOW.getTime() + 32 * DAY_MS);
    await prisma.business.update({ where: { id: business.id }, data: { subscriptionEndsAt: extended } });

    await expect(runSubscriptionLifecycle(new Date(extended.getTime() - 2 * DAY_MS), { businessId: business.id })).resolves.toBe(1);
    expect(await notificationKinds(business.id)).toEqual(["SUBSCRIPTION_ENDING", "SUBSCRIPTION_ENDING"]);
  });

  async function createBusiness(subscription: { status: SubscriptionStatus; endsAt: Date | null }) {
    const suffix = randomUUID();
    return prisma.business.create({
      data: {
        name: `Салон подписки ${suffix}`,
        slug: `subscription-${suffix}`,
        subscriptionPlan: "PREMIUM",
        subscriptionStatus: subscription.status,
        subscriptionEndsAt: subscription.endsAt,
      },
    });
  }

  function subscriptionOf(businessId: string) {
    return prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { subscriptionPlan: true, subscriptionStatus: true, subscriptionEndsAt: true },
    });
  }

  async function notificationKinds(businessId: string) {
    const notifications = await prisma.businessNotification.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
      select: { kind: true },
    });
    return notifications.map((notification) => notification.kind);
  }
});
