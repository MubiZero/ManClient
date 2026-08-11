import type { BillingPeriod, SubscriptionPlan } from "@/generated/prisma/client";

import { writePlatformAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { PlatformError } from "@/core/platform/platform-error";

/** The plans that can carry a price. `START` is the free tier, so pricing it is a mistake, not a choice. */
export const SELLABLE_PLANS = ["STANDARD", "PREMIUM"] as const satisfies readonly SubscriptionPlan[];

export const BILLING_PERIODS = ["MONTHLY", "YEARLY"] as const satisfies readonly BillingPeriod[];

export const PERIOD_LABELS: Record<BillingPeriod, string> = {
  MONTHLY: "Месяц",
  YEARLY: "Год",
};

export type PlanPriceRow = {
  plan: SubscriptionPlan;
  period: BillingPeriod;
  amountDiram: number;
  updatedById: string | null;
  updatedAt: Date;
};

export async function listPlanPrices(): Promise<PlanPriceRow[]> {
  return prisma.planPrice.findMany({
    select: { plan: true, period: true, amountDiram: true, updatedById: true, updatedAt: true },
    orderBy: [{ plan: "asc" }, { period: "asc" }],
  });
}

/** What one plan and period costs, or null when the platform does not sell that combination. */
export async function getPlanPrice(plan: SubscriptionPlan, period: BillingPeriod): Promise<number | null> {
  const price = await prisma.planPrice.findUnique({
    where: { plan_period: { plan, period } },
    select: { amountDiram: true },
  });
  return price?.amountDiram ?? null;
}

export async function setPlanPrice(input: {
  plan: SubscriptionPlan;
  period: BillingPeriod;
  amountDiram: number;
  actorUserId: string;
}): Promise<void> {
  if (!SELLABLE_PLANS.includes(input.plan as (typeof SELLABLE_PLANS)[number])) {
    throw new PlatformError("INVALID_INPUT", { plan: input.plan });
  }
  if (!Number.isInteger(input.amountDiram) || input.amountDiram <= 0) {
    throw new PlatformError("INVALID_INPUT", { amountDiram: input.amountDiram });
  }

  const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { isPlatformAdmin: true } });
  if (!actor?.isPlatformAdmin) throw new PlatformError("FORBIDDEN");

  await prisma.$transaction(async (transaction) => {
    const previous = await transaction.planPrice.findUnique({
      where: { plan_period: { plan: input.plan, period: input.period } },
      select: { amountDiram: true },
    });
    await transaction.planPrice.upsert({
      where: { plan_period: { plan: input.plan, period: input.period } },
      create: { plan: input.plan, period: input.period, amountDiram: input.amountDiram, updatedById: input.actorUserId },
      update: { amountDiram: input.amountDiram, updatedById: input.actorUserId },
    });
    await writePlatformAuditEvent({
      type: "platform.plan_price.changed",
      actorId: input.actorUserId,
      metadata: {
        plan: input.plan,
        period: input.period,
        amountDiram: input.amountDiram,
        // Null on the first price, which is exactly the difference between setting one and changing one.
        previousAmountDiram: previous?.amountDiram ?? null,
      },
    }, transaction);
  });
}

/** Removes a plan from sale without touching anyone already subscribed to it. */
export async function clearPlanPrice(input: { plan: SubscriptionPlan; period: BillingPeriod; actorUserId: string }): Promise<void> {
  const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { isPlatformAdmin: true } });
  if (!actor?.isPlatformAdmin) throw new PlatformError("FORBIDDEN");

  await prisma.$transaction(async (transaction) => {
    const removed = await transaction.planPrice.deleteMany({ where: { plan: input.plan, period: input.period } });
    if (removed.count === 0) return;
    await writePlatformAuditEvent({
      type: "platform.plan_price.cleared",
      actorId: input.actorUserId,
      metadata: { plan: input.plan, period: input.period },
    }, transaction);
  });
}
