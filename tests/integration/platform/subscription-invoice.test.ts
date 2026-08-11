import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import { setPlanPrice } from "@/core/platform/plan-pricing";
import { PlatformError } from "@/core/platform/platform-error";
import {
  createSubscriptionInvoice,
  getOpenInvoice,
  listInvoices,
  subscriptionPaymentUrl,
} from "@/core/platform/subscription-invoice-service";

describe("subscription invoices", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  let businessId: string;
  let adminId: string;
  const platformCard = process.env.PLATFORM_PAYMENT_CARD;

  beforeEach(async () => {
    const admin = await prisma.user.create({
      data: { email: `invoice-admin-${randomUUID()}@example.test`, displayName: "Админ", isPlatformAdmin: true },
    });
    adminId = admin.id;
    userIds.push(admin.id);
    const suffix = randomUUID();
    const business = await prisma.business.create({ data: { name: `Салон счёта ${suffix}`, slug: `invoice-${suffix}` } });
    businessId = business.id;
    businessIds.push(business.id);
    process.env.PLATFORM_PAYMENT_CARD = "1234567812345678";
  });

  afterEach(async () => {
    if (platformCard === undefined) delete process.env.PLATFORM_PAYMENT_CARD;
    else process.env.PLATFORM_PAYMENT_CARD = platformCard;
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.planPrice.deleteMany({ where: { updatedById: { in: userIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("copies the price into the invoice and keeps it there when the price moves", async () => {
    await setPlanPrice({ plan: "PREMIUM", period: "MONTHLY", amountDiram: 30_000, actorUserId: adminId });
    const invoice = await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "MONTHLY" });
    expect(invoice).toMatchObject({ amountDiram: 30_000, status: "OPEN", plan: "PREMIUM", period: "MONTHLY" });

    await setPlanPrice({ plan: "PREMIUM", period: "MONTHLY", amountDiram: 45_000, actorUserId: adminId });

    // What the business was asked to pay is what it still owes; re-pricing is for the next invoice.
    await expect(getOpenInvoice(businessId)).resolves.toMatchObject({ id: invoice.id, amountDiram: 30_000 });
  });

  it("refuses to bill a plan the platform does not sell", async () => {
    await expect(createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "YEARLY" }))
      .rejects.toMatchObject({ code: "NOT_PRICED" } satisfies Partial<PlatformError>);
    await expect(createSubscriptionInvoice({ businessId, plan: "START", period: "MONTHLY" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<PlatformError>);
    await expect(listInvoices(businessId)).resolves.toEqual([]);
  });

  it("returns the invoice already open instead of billing twice", async () => {
    await setPlanPrice({ plan: "STANDARD", period: "MONTHLY", amountDiram: 15_000, actorUserId: adminId });
    const first = await createSubscriptionInvoice({ businessId, plan: "STANDARD", period: "MONTHLY" });
    const second = await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "YEARLY" });

    expect(second.id).toBe(first.id);
    await expect(listInvoices(businessId)).resolves.toHaveLength(1);
  });

  it("bills again once the open invoice is settled", async () => {
    await setPlanPrice({ plan: "STANDARD", period: "MONTHLY", amountDiram: 15_000, actorUserId: adminId });
    const first = await createSubscriptionInvoice({ businessId, plan: "STANDARD", period: "MONTHLY" });
    await prisma.subscriptionInvoice.update({ where: { id: first.id }, data: { status: "PAID", paidAt: new Date() } });

    const second = await createSubscriptionInvoice({ businessId, plan: "STANDARD", period: "MONTHLY" });
    expect(second.id).not.toBe(first.id);
    expect(second.reference).not.toBe(first.reference);
    await expect(getOpenInvoice(businessId)).resolves.toMatchObject({ id: second.id });
  });

  it("points the payment link at the platform card with the amount and the invoice number", async () => {
    await setPlanPrice({ plan: "PREMIUM", period: "MONTHLY", amountDiram: 30_000, actorUserId: adminId });
    const invoice = await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "MONTHLY" });

    const url = subscriptionPaymentUrl(invoice)!;
    expect(url.searchParams.get("A")).toBe("1234567812345678");
    expect(url.searchParams.get("s")).toBe("300.00");
    expect(url.searchParams.get("c")).toBe(invoice.reference);
  });

  it("offers no self-service payment while the platform card is unset", async () => {
    delete process.env.PLATFORM_PAYMENT_CARD;
    await setPlanPrice({ plan: "PREMIUM", period: "MONTHLY", amountDiram: 30_000, actorUserId: adminId });
    const invoice = await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "MONTHLY" });

    // The cabinet says the operator takes the payment rather than showing a broken link.
    expect(subscriptionPaymentUrl(invoice)).toBeNull();
  });

  it("keeps one business out of another's invoices", async () => {
    await setPlanPrice({ plan: "STANDARD", period: "MONTHLY", amountDiram: 15_000, actorUserId: adminId });
    await createSubscriptionInvoice({ businessId, plan: "STANDARD", period: "MONTHLY" });

    const suffix = randomUUID();
    const other = await prisma.business.create({ data: { name: `Чужой салон ${suffix}`, slug: `other-${suffix}` } });
    businessIds.push(other.id);

    await expect(listInvoices(other.id)).resolves.toEqual([]);
    await expect(getOpenInvoice(other.id)).resolves.toBeNull();
  });
});
