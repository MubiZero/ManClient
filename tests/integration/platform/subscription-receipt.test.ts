import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import { PlatformError } from "@/core/platform/platform-error";
import { setPlanPrice } from "@/core/platform/plan-pricing";
import { createSubscriptionInvoice } from "@/core/platform/subscription-invoice-service";
import {
  approveSubscriptionReceipt,
  listSubscriptionReceiptsForReview,
  rejectSubscriptionReceipt,
  submitSubscriptionReceipt,
} from "@/core/platform/subscription-receipt-service";

const PLATFORM_CARD = "1234567812345678";
const NOW = new Date("2026-09-10T09:00:00.000Z");

describe("subscription receipts", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  let businessId: string;
  let adminId: string;
  let ownerId: string;
  const cardBefore = process.env.PLATFORM_PAYMENT_CARD;

  beforeEach(async () => {
    process.env.PLATFORM_PAYMENT_CARD = PLATFORM_CARD;
    const admin = await prisma.user.create({ data: { email: `sub-admin-${randomUUID()}@example.test`, displayName: "Админ", isPlatformAdmin: true } });
    const owner = await prisma.user.create({ data: { email: `sub-owner-${randomUUID()}@example.test`, displayName: "Владелец" } });
    adminId = admin.id;
    ownerId = owner.id;
    userIds.push(admin.id, owner.id);

    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: {
        name: `Салон подписки ${suffix}`,
        slug: `receipt-${suffix}`,
        subscriptionPlan: "PREMIUM",
        subscriptionStatus: "GRACE",
        subscriptionEndsAt: new Date("2026-09-05T00:00:00.000Z"),
      },
    });
    businessId = business.id;
    businessIds.push(business.id);
    await setPlanPrice({ plan: "PREMIUM", period: "MONTHLY", amountDiram: 30_000, actorUserId: adminId });
  });

  afterEach(async () => {
    if (cardBefore === undefined) delete process.env.PLATFORM_PAYMENT_CARD;
    else process.env.PLATFORM_PAYMENT_CARD = cardBefore;
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.planPrice.deleteMany({ where: { updatedById: { in: userIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("pays the invoice and extends the period when the receipt matches on all five counts", async () => {
    const invoice = await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "MONTHLY" });
    const receipt = await submit({ amountDiram: 30_000 });

    expect(receipt.status).toBe("ACCEPTED");
    await expect(prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).resolves.toMatchObject({ status: "PAID" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business.subscriptionStatus).toBe("ACTIVE");
    // Lapsed on 5 September, so a month bought on the 10th runs from today, not from the dead period.
    expect(business.subscriptionEndsAt?.toISOString()).toBe("2026-10-10T09:00:00.000Z");
  });

  it("sends a receipt for the wrong amount to the platform queue instead of paying", async () => {
    const invoice = await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "MONTHLY" });
    const receipt = await submit({ amountDiram: 12_000 });

    expect(receipt).toMatchObject({ status: "NEEDS_REVIEW", attentionReason: "AMOUNT_MISMATCH" });
    await expect(prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).resolves.toMatchObject({ status: "NEEDS_ATTENTION" });
    await expect(prisma.business.findUniqueOrThrow({ where: { id: businessId } })).resolves.toMatchObject({ subscriptionStatus: "GRACE" });

    const queue = await listSubscriptionReceiptsForReview({ actorUserId: adminId });
    expect(queue.map((item) => item.id)).toContain(receipt.id);
  });

  it("refuses an operation number that has already paid for something", async () => {
    await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "MONTHLY" });
    await submit({ amountDiram: 30_000, operationNumber: "555000111" });

    const suffix = randomUUID();
    const other = await prisma.business.create({ data: { name: `Второй салон ${suffix}`, slug: `receipt-two-${suffix}` } });
    businessIds.push(other.id);
    await createSubscriptionInvoice({ businessId: other.id, plan: "PREMIUM", period: "MONTHLY" });

    await expect(submit({ amountDiram: 30_000, operationNumber: "555000111", businessId: other.id }))
      .rejects.toMatchObject({ code: "DUPLICATE_OPERATION" } satisfies Partial<PlatformError>);
    await expect(prisma.business.findUniqueOrThrow({ where: { id: other.id } })).resolves.toMatchObject({ subscriptionStatus: "ACTIVE", subscriptionEndsAt: null });
  });

  it("refuses a receipt from a business with nothing to pay", async () => {
    await expect(submit({ amountDiram: 30_000 })).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<PlatformError>);
  });

  it("keeps the queue and an operator's decision to platform admins", async () => {
    await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "MONTHLY" });
    const receipt = await submit({ amountDiram: 12_000 });

    await expect(listSubscriptionReceiptsForReview({ actorUserId: ownerId })).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<PlatformError>);
    await expect(approveSubscriptionReceipt({ receiptId: receipt.id, actorUserId: ownerId })).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<PlatformError>);
    await expect(rejectSubscriptionReceipt({ receiptId: receipt.id, actorUserId: ownerId, reason: "не наш перевод" })).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<PlatformError>);
  });

  it("lets the operator settle a disputed receipt by hand", async () => {
    const invoice = await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "MONTHLY" });
    const receipt = await submit({ amountDiram: 12_000 });

    await approveSubscriptionReceipt({ receiptId: receipt.id, actorUserId: adminId, now: NOW });

    await expect(prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).resolves.toMatchObject({ status: "PAID" });
    await expect(prisma.business.findUniqueOrThrow({ where: { id: businessId } })).resolves.toMatchObject({ subscriptionStatus: "ACTIVE" });
    await expect(prisma.auditEvent.findMany({ where: { businessId, type: "subscription.paid" } })).resolves.toHaveLength(1);
  });

  it("leaves the invoice open when the operator rejects the receipt", async () => {
    const invoice = await createSubscriptionInvoice({ businessId, plan: "PREMIUM", period: "MONTHLY" });
    const receipt = await submit({ amountDiram: 12_000 });

    await rejectSubscriptionReceipt({ receiptId: receipt.id, actorUserId: adminId, reason: "перевод на другую карту" });

    await expect(prisma.subscriptionReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).resolves.toMatchObject({ status: "REJECTED", reviewNote: "перевод на другую карту" });
    await expect(prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).resolves.toMatchObject({ status: "OPEN" });
    await expect(prisma.business.findUniqueOrThrow({ where: { id: businessId } })).resolves.toMatchObject({ subscriptionStatus: "GRACE" });
  });

  /** A one-pixel JPEG stands in for the photo: the recognizer is injected, so the bytes only have to decode. */
  async function submit(input: { amountDiram: number; operationNumber?: string; businessId?: string }) {
    const sharp = (await import("sharp")).default;
    const bytes = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).jpeg().toBuffer());
    return submitSubscriptionReceipt(
      { businessId: input.businessId ?? businessId, bytes, contentType: "image/jpeg" },
      NOW,
      {
        store: async ({ storageKey }) => storageKey,
        recognize: async () => ({
          operationNumber: input.operationNumber ?? randomUUID().replace(/\D/g, "").padEnd(9, "7").slice(0, 9),
          amountDiram: input.amountDiram,
          recipientCardSuffix: PLATFORM_CARD.slice(-4),
          operationAt: new Date(NOW.getTime() - 60_000),
          isSuccessful: true,
        }),
      },
    );
  }
});
