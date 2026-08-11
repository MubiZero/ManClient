import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import { listPlanPrices, setPlanPrice } from "@/core/platform/plan-pricing";
import { PlatformError } from "@/core/platform/platform-error";

describe("plan pricing", () => {
  const userIds: string[] = [];
  let adminId: string;
  let outsiderId: string;

  beforeEach(async () => {
    const admin = await prisma.user.create({
      data: { email: `price-admin-${randomUUID()}@example.test`, displayName: "Админ платформы", isPlatformAdmin: true },
    });
    const outsider = await prisma.user.create({
      data: { email: `price-owner-${randomUUID()}@example.test`, displayName: "Владелец салона" },
    });
    adminId = admin.id;
    outsiderId = outsider.id;
    userIds.push(admin.id, outsider.id);
  });

  afterEach(async () => {
    // The price list is one row per plan and period for the whole platform, so each test leaves it
    // as it found it rather than scoping to a fixture the way business-owned tables allow.
    await prisma.planPrice.deleteMany({ where: { updatedById: { in: userIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("keeps one price per plan and period, overwriting rather than piling up", async () => {
    await setPlanPrice({ plan: "STANDARD", period: "MONTHLY", amountDiram: 15_000, actorUserId: adminId });
    await setPlanPrice({ plan: "STANDARD", period: "MONTHLY", amountDiram: 19_000, actorUserId: adminId });

    const prices = await listPlanPrices();
    const standardMonthly = prices.filter((price) => price.plan === "STANDARD" && price.period === "MONTHLY");
    expect(standardMonthly).toHaveLength(1);
    expect(standardMonthly[0]).toMatchObject({ amountDiram: 19_000, updatedById: adminId });
  });

  it("refuses a price that is not a positive amount", async () => {
    for (const amountDiram of [0, -100, 1.5]) {
      await expect(setPlanPrice({ plan: "PREMIUM", period: "MONTHLY", amountDiram, actorUserId: adminId }))
        .rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<PlatformError>);
    }
  });

  it("refuses to price the free plan", async () => {
    await expect(setPlanPrice({ plan: "START", period: "MONTHLY", amountDiram: 10_000, actorUserId: adminId }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<PlatformError>);
  });

  it("lets only a platform admin change what the product costs", async () => {
    await expect(setPlanPrice({ plan: "PREMIUM", period: "YEARLY", amountDiram: 500_000, actorUserId: outsiderId }))
      .rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<PlatformError>);
    await expect(listPlanPrices()).resolves.toEqual(
      expect.not.arrayContaining([expect.objectContaining({ plan: "PREMIUM", period: "YEARLY" })]),
    );
  });

  it("records every change in the audit log", async () => {
    await setPlanPrice({ plan: "PREMIUM", period: "MONTHLY", amountDiram: 30_000, actorUserId: adminId });
    await setPlanPrice({ plan: "PREMIUM", period: "MONTHLY", amountDiram: 35_000, actorUserId: adminId });

    const events = await prisma.auditEvent.findMany({ where: { actorId: adminId, type: "platform.plan_price.changed" }, orderBy: { createdAt: "asc" } });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ businessId: null, actorType: "platform_admin" });
    expect(events[1].metadata).toMatchObject({ plan: "PREMIUM", period: "MONTHLY", amountDiram: 35_000, previousAmountDiram: 30_000 });
  });
});
