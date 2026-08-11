import { randomBytes } from "node:crypto";

import type { BillingPeriod, SubscriptionInvoice, SubscriptionPlan } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";
import { getPlanPrice, SELLABLE_PLANS } from "@/core/platform/plan-pricing";
import { PlatformError } from "@/core/platform/platform-error";
import { platformPaymentCard } from "@/core/platform/platform-payment-card";
import { createPaymentUrl } from "@/integrations/dushanbe-city/payment-link";

const INVOICES_PAGE_SIZE = 20;

/** The one invoice a business is expected to pay, or null when it owes nothing. */
export function getOpenInvoice(businessId: string) {
  return prisma.subscriptionInvoice.findFirst({
    where: { businessId, status: { in: ["OPEN", "NEEDS_ATTENTION"] } },
    orderBy: { createdAt: "desc" },
  });
}

export function listInvoices(businessId: string) {
  return prisma.subscriptionInvoice.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: INVOICES_PAGE_SIZE,
  });
}

/**
 * Bills `businessId` for one period of `plan`, or hands back the invoice it already owes. Two open
 * invoices would be two transfers to match against one subscription, so the second request is
 * answered with the first invoice rather than with a new one.
 */
export async function createSubscriptionInvoice(input: {
  businessId: string;
  plan: SubscriptionPlan;
  period: BillingPeriod;
}): Promise<SubscriptionInvoice> {
  if (!SELLABLE_PLANS.includes(input.plan as (typeof SELLABLE_PLANS)[number])) {
    throw new PlatformError("INVALID_INPUT", { plan: input.plan });
  }

  const open = await getOpenInvoice(input.businessId);
  if (open) return open;

  const amountDiram = await getPlanPrice(input.plan, input.period);
  if (amountDiram === null) throw new PlatformError("NOT_PRICED", { plan: input.plan, period: input.period });

  return prisma.subscriptionInvoice.create({
    data: {
      businessId: input.businessId,
      plan: input.plan,
      period: input.period,
      // Snapshot, not a lookup: re-pricing the plan tomorrow must not change what was billed today.
      amountDiram,
      reference: invoiceReference(),
    },
  });
}

/**
 * Where the business pays this invoice, or null while the platform card is unset — in which case the
 * cabinet says an operator takes the payment instead of showing a link that cannot work.
 */
export function subscriptionPaymentUrl(invoice: Pick<SubscriptionInvoice, "amountDiram" | "reference">): URL | null {
  const cardNumber = platformPaymentCard();
  if (!cardNumber) return null;
  return createPaymentUrl({ cardNumber, amountDiram: invoice.amountDiram, bookingReference: invoice.reference });
}

/**
 * Short, unique and readable over the phone. Random rather than sequential: the number travels in a
 * payment link, and a counter would tell every business how many others there are.
 */
function invoiceReference(): string {
  return `SUB-${randomBytes(4).toString("hex").toUpperCase()}`;
}
